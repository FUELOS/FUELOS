"""Run against a migrated disposable PostgreSQL DB; never against production.

DATABASE_URL=... python -m pytest tests/test_audit_api.py -q
Uses the repository's seeded admin account and creates uniquely named fixtures.
"""
import asyncio
import json
import os
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone

from httpx import ASGITransport, AsyncClient
import pytest
from app.config import get_settings
from app.database import async_session_factory, engine
from app.models.base import PaymentMethod, TransactionType
from app.models.transaction import Transaction
from app.main import app


@pytest.mark.skipif(engine.url.host not in ('127.0.0.1', 'localhost') or 'audit' not in (engine.url.database or ''),
                    reason='Requires a migrated, seeded disposable audit database')
def test_audit_api_regressions(monkeypatch):
    asyncio.run(_run(monkeypatch))


async def _run(monkeypatch):
    assert engine.url.host in ('127.0.0.1', 'localhost') and 'audit' in engine.url.database
    failures = []
    suffix = uuid.uuid4().hex[:10]
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        async def req(method, path, headers=None, expected=200, **kw):
            r = await client.request(method, '/api' + path, headers=headers, **kw)
            assert r.status_code == expected, (path, r.status_code, r.text)
            return r.json()

        async def login(email, password='AuditOnly2026!'):
            data = await req('POST', '/auth/login', json=dict(email=email, password=password))
            return {'Authorization': 'Bearer ' + data['access_token']}

        async def check(label, method, path, headers, codes=(422,), **kw):
            r = await client.request(method, '/api' + path, headers=headers, **kw)
            if r.status_code not in codes:
                failures.append(f'{label}: HTTP {r.status_code}, expected {codes}')
            return r

        admin = await login('admin@fuelos.com', 'FuelOS2026!')
        stations = [await req('POST', '/stations', admin, 201,
                    json=dict(name=f'Audit {suffix} {i}', code=f'FX-{suffix}-{i}', city='Ankara')) for i in range(2)]
        users, auth = {}, {}
        for name, role in [('manager', 'station_manager'), ('cashier', 'cashier'), ('other', 'cashier'), ('target', 'cashier')]:
            email = f'{name}.{suffix}@audit.test'
            users[name] = await req('POST', '/users', admin, 201, json=dict(email=email,
                password='AuditOnly2026!', full_name=f'Audit {name}', role=role, station_id=stations[0]['id']))
            auth[name] = await login(email)
        mgr, cashier = auth['manager'], auth['cashier']
        pumps = [await req('POST', '/pumps/', admin, json=dict(station_id=s['id'],
                    pump_number=1, label='Audit', fuel_types='Motorin')) for s in stations]
        shift = await req('POST', '/shifts/open', cashier, 201,
                    json=dict(station_id=stations[0]['id'], opening_cash='0'))
        other_shift = await req('POST', '/shifts/open', auth['other'], 201,
                    json=dict(station_id=stations[0]['id'], opening_cash='0'))
        customer = await req('POST', '/veresiye/customers', mgr, 201, json=dict(
                    full_name=f'Audit {suffix}', tc_no='10000000146', phone='05000000000', plate='06AAA123'))
        sale = dict(shift_id=shift['id'], type='fuel', payment_method='veresiye', amount='1000.00',
                    liters='20', fuel_type='Motorin', credit=dict(account_type='individual',
                    credit_customer_id=customer['id'], plate='06NEW123'))
        sale_key = {**cashier, 'Idempotency-Key': str(uuid.uuid4())}
        a = await req('POST', '/transactions', sale_key, 201, json=sale)
        b = await req('POST', '/transactions', sale_key, 201, json=sale)
        if a['id'] != b['id']:
            failures.append('sale retry created another transaction')
        if a['credit_sale']['plate'] != '06NEW123':
            failures.append('sale plate did not use the entered snapshot')
        await check('changed sale retry', 'POST', '/transactions', sale_key, (409,), json={**sale, 'amount':'1001'})
        await check('backdated sale', 'POST', '/transactions', cashier,
                    json={**sale, 'transaction_time':'2020-01-01T10:00:00Z'})
        await check('future sale', 'POST', '/transactions', cashier,
                    json={**sale, 'transaction_time':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()})
        for endpoint in ('pos', 'qr'):
            await check('other cashier simulator', 'POST', '/simulate/' + endpoint, cashier, (403,),
                        json=dict(shift_id=other_shift['id'], amount=25, liters=1))
        await check('foreign shift pump', 'POST', '/shifts/open', mgr,
                    json=dict(station_id=stations[0]['id'], opening_cash='0', pump_id=pumps[1]['id']))
        await check('role escalation', 'PATCH', '/users/' + users['target']['id'], mgr, (403,), json={'role':'super_admin'})
        await check('station transfer', 'PATCH', '/users/' + users['target']['id'], mgr, (403,), json={'station_id':stations[1]['id']})
        payment = dict(account_type='individual', credit_customer_id=customer['id'], kind='payment', amount='100', method='cash')
        await check('future collection', 'POST', '/veresiye/payments', mgr, json={**payment,
                    'payment_date':(datetime.now(timezone.utc)+timedelta(hours=12)).isoformat()})
        key = {**mgr, 'Idempotency-Key':str(uuid.uuid4())}
        p1, p2 = await asyncio.gather(*(req('POST', '/veresiye/payments', key, 201, json=payment) for _ in range(2)))
        if p1['id'] != p2['id']:
            failures.append('concurrent payment retry created another payment')
        await check('changed payment retry', 'POST', '/veresiye/payments', key, (409,), json={**payment,'amount':'101'})
        await req('POST', '/veresiye/payments', mgr, 201, json={**payment,'kind':'adjustment','amount':'300','note':'Correction'})
        stmt = await req('GET', f"/veresiye/customers/{customer['id']}/statement", mgr)
        if float(stmt['balance']['balance']) != 600 or float(stmt['balance']['total_payments']) != 100:
            failures.append('statement totals include duplicate or adjustment collections')
        first = await client.get('/api/veresiye/payments?limit=1', headers=mgr)
        second = await client.get('/api/veresiye/payments?limit=1&offset=1', headers=mgr)
        if first.json()[0]['id'] == second.json()[0]['id'] or first.headers.get('X-Total-Count') != '2':
            failures.append('counted payment pagination missing')
        overview = await client.get('/api/veresiye/summary', headers=mgr)
        if overview.status_code != 200 or float(overview.json()['individual_receivable']) != 600:
            failures.append('unfiltered overview missing or wrong')
        for _ in range(201):
            await req('POST', '/transactions', cashier, 201, json={**sale, 'amount':'1.00'})
        page1 = await client.get('/api/veresiye/sales?limit=200', headers=mgr)
        page2 = await client.get('/api/veresiye/sales?limit=200&offset=200', headers=mgr)
        assert page1.headers['X-Total-Count'] == '202'
        assert len(page1.json()) == 200 and len(page2.json()) == 2
        assert not {s['id'] for s in page1.json()} & {s['id'] for s in page2.json()}
        for _ in range(201):
            await req('POST', '/veresiye/payments', mgr, 201, json={**payment, 'amount':'1.00'})
        page1 = await client.get('/api/veresiye/payments?limit=200', headers=mgr)
        page2 = await client.get('/api/veresiye/payments?limit=200&offset=200', headers=mgr)
        assert page1.headers['X-Total-Count'] == '203'
        assert len(page1.json()) == 200 and len(page2.json()) == 3
        assert not {p['id'] for p in page1.json()} & {p['id'] for p in page2.json()}

        limited_customer = await req('POST', '/veresiye/customers', mgr, 201, json=dict(
            full_name=f'Payment limit {suffix}', tc_no='11111111110', phone='05000000001'))
        await req('POST', '/transactions', cashier, 201, json={
            **sale, 'amount': '300.00',
            'credit': {**sale['credit'], 'credit_customer_id': limited_customer['id']},
        })
        limited_payment = {**payment, 'credit_customer_id': limited_customer['id']}
        await req('POST', '/veresiye/payments', mgr, 409, json={**limited_payment, 'amount': '305.00'})
        results = await asyncio.gather(*(
            client.post('/api/veresiye/payments', headers=mgr, json={**limited_payment, 'amount': '180.00'})
            for _ in range(2)
        ))
        assert sorted(result.status_code for result in results) == [201, 409]
        await req('POST', '/veresiye/payments', mgr, 201, json={**limited_payment, 'amount': '120.00'})
        await req('POST', '/veresiye/payments', mgr, 409, json={**limited_payment, 'amount': '0.01'})
        settled = await req('GET', f"/veresiye/customers/{limited_customer['id']}/statement", mgr)
        assert settled['balance']['balance'] == '0.00'
        assert settled['balance']['total_payments'] == '300.00'

        async with async_session_factory() as db:
            legacy = Transaction(shift_id=uuid.UUID(shift['id']), station_id=uuid.UUID(stations[0]['id']),
                type=TransactionType.FUEL, payment_method=PaymentMethod.VERESIYE, amount=10,
                liters=1, fuel_type='Motorin', description='AUDIT BROWSER UNLINKED',
                transaction_time=datetime.now(timezone.utc))
            db.add(legacy)
            await db.commit()

        with monkeypatch.context() as disabled:
            disabled.setattr(get_settings(), 'INDIVIDUAL_CREDIT_ENABLED', False)
            session = await req('GET', '/auth/me', mgr)
            assert session.get('individual_credit_enabled') is False
            await req('POST', '/veresiye/customers', mgr, 403, json=dict(
                full_name='Disabled customer', tc_no='11111111110', phone='05000000000'))
            await req('POST', '/transactions', cashier, 403, json=sale)
            await req('POST', '/veresiye/sales/link', mgr, 403, json=dict(
                transaction_id=str(legacy.id), account_type='individual', credit_customer_id=customer['id']))
            assert (await req('POST', '/transactions', sale_key, 201, json=sale))['id'] == a['id']
            await req('GET', f"/veresiye/customers/{customer['id']}/statement", mgr)

        if os.environ.get('AUDIT_BROWSER_FIXTURE_PATH'):
            Path(os.environ['AUDIT_BROWSER_FIXTURE_PATH']).write_text(json.dumps({
                'manager_email': users['manager']['email'], 'cashier_email': users['cashier']['email'],
                'station_id':stations[0]['id'], 'shift_id':shift['id'], 'customer':customer,
                'unlinked_transaction_id':str(legacy.id),
            }), encoding='utf8')
        await req('PATCH', '/users/' + users['manager']['id'], admin, json={'station_id':stations[1]['id']})
        moved_mgr = await login(users['manager']['email'])
        await check('retry after station transfer', 'POST', '/veresiye/payments',
                    {**moved_mgr,'Idempotency-Key':key['Idempotency-Key']}, (404,), json=payment)
        await req('PATCH', '/users/' + users['manager']['id'], admin, json={'station_id':stations[0]['id']})
    await engine.dispose()
    assert not failures, '\n'.join(failures)
