/* Run only with the disposable fixtures emitted by backend/test_audit_api.py.
 * Requires Playwright in the QA environment; no application dependency is added.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = JSON.parse(fs.readFileSync(process.env.AUDIT_BROWSER_FIXTURE_PATH, 'utf8'));
const base = process.env.AUDIT_FRONTEND_URL || 'http://127.0.0.1:5173';
const apiOrigin = process.env.AUDIT_BACKEND_URL || 'http://127.0.0.1:8000';
const individualDisabled = process.env.AUDIT_INDIVIDUAL_DISABLED === '1';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
assert(['127.0.0.1', 'localhost'].includes(new URL(apiOrigin).hostname));
assert(fixture.manager_email.endsWith('@audit.test'));

function tc() {
  const d = ('5' + String(Date.now()).slice(-8)).split('').map(Number);
  d.push(((d[0]+d[2]+d[4]+d[6]+d[8])*7-(d[1]+d[3]+d[5]+d[7])+100)%10);
  d.push(d.reduce((a,b)=>a+b,0)%10);
  return d.join('');
}

(async () => {
  let stage = 'start';
  let page;
  const browser = await chromium.launch({headless:true,
    ...(process.env.AUDIT_CHROME_PATH ? {executablePath:process.env.AUDIT_CHROME_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const login = await context.request.post(apiOrigin+'/api/auth/login', {
      data:{email:fixture.manager_email,password:'AuditOnly2026!'},
    });
    assert.equal(login.status(),200);
    const session = await login.json();
    assert.equal(session.individual_credit_enabled, !individualDisabled);
    const token = session.access_token;
    const headers = {Authorization:'Bearer '+token};
    const api = async (method, path, data) => {
      const response = await context.request.fetch(apiOrigin+'/api'+path,{method,headers,data});
      assert(response.ok(), `${method} ${path}: ${response.status()}`);
      return response.json();
    };
    await context.addInitScript(token => {
      localStorage.setItem('fuelos_token',token);
      localStorage.setItem('fuelos_lang','tr');
    },token);
    await page.route('**/api/**',async route=>{
      const u = new URL(route.request().url());
      const response = await route.fetch({url:apiOrigin+u.pathname+u.search});
      await route.fulfill({response});
    });
    await page.goto(base+'/veresiye');
    await page.waitForLoadState('networkidle');
    if (individualDisabled) {
      stage = 'individual archive';
      await page.getByRole('button',{name:'Bireysel Arşiv',exact:true}).click();
      await page.getByText(fixture.customer.full_name,{exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Yeni Müşteri',exact:true}).count(),0);
      await page.getByRole('button',{name:'Tahsilat Kaydet',exact:true}).click();
      await page.getByPlaceholder('0.00').fill('1');
      const [payment] = await Promise.all([
        page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/veresiye/payments')),
        page.getByRole('button',{name:'Kaydet',exact:true}).click(),
      ]);
      assert.equal(payment.status(),201);
      assert.equal((await payment.json()).credit_customer_id,fixture.customer.id);

      stage = 'corporate sale with individual credit disabled';
      const driverTc = tc();
      const plate = '06QA'+String(Date.now()).slice(-4);
      const company = await api('POST','/veresiye/companies',{
        name:'Browser fleet '+Date.now(),vehicles:[{plate}],
        drivers:[{full_name:'Browser driver',tc_no:driverTc}],
      });
      await page.goto(base+'/transactions');
      await page.waitForLoadState('networkidle');
      const customerRequests = [];
      page.on('request',r=>{
        if (new URL(r.url()).pathname === '/api/veresiye/customers') customerRequests.push(r.method());
      });
      await page.getByRole('button',{name:'Yeni Satış Kaydı',exact:true}).click();
      await page.getByRole('button',{name:'Tüm Pompalar',exact:true}).waitFor();
      await page.getByPlaceholder('850.00').fill('20');
      await page.getByPlaceholder('18.80').fill('1');
      await page.getByRole('button',{name:/Veresiye/}).click();
      assert.equal(await page.getByRole('button',{name:'Bireysel',exact:true}).count(),0);
      await page.getByPlaceholder('Örn: 06 ABC 123').fill(plate);
      await page.getByRole('button',{name:'Sorgula',exact:true}).click();
      await page.getByPlaceholder('11 haneli T.C. no',{exact:true}).fill(driverTc);
      const [verification] = await Promise.all([
        page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/veresiye/verify')),
        page.getByRole('button',{name:'Kimliği Doğrula',exact:true}).click(),
      ]);
      assert.equal((await verification.json()).identity_verified,true);
      const [sale] = await Promise.all([
        page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/transactions')),
        page.getByRole('button',{name:'Satışı Kaydet',exact:true}).click(),
      ]);
      assert.equal(sale.status(),201);
      const saleData = await sale.json();
      assert.equal(saleData.credit_sale.credit_company_id,company.id);
      await page.getByRole('button',{name:'Daha Sonra Yükle',exact:true}).click();

      stage = 'corporate linking with individual credit disabled';
      const row = page.getByText('AUDIT BROWSER UNLINKED',{exact:true}).locator('xpath=ancestor::tr');
      await row.getByRole('button',{name:'Hesaba Bağla',exact:true}).click();
      const selects = page.locator('form select');
      await selects.first().selectOption(company.id);
      assert.equal(await page.getByRole('button',{name:'Bireysel',exact:true}).count(),0);
      const [linked] = await Promise.all([
        page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/veresiye/sales/link')),
        page.locator('form button[type=submit]').click(),
      ]);
      assert.equal(linked.status(),201);
      assert.equal((await linked.json()).credit_company_id,company.id);
      assert.deepEqual(customerRequests,[]);

      stage = 'shift reconciliation with individual credit disabled';
      const shift = await api('GET','/shifts/'+saleData.shift_id);
      const closed = await api('POST','/shifts/'+saleData.shift_id+'/close',{closing_cash:shift.opening_cash});
      assert.equal(closed.reconciliation.status,'matched');
      assert(Number(closed.credit_breakdown.individual)>0);
      assert(Number(closed.credit_breakdown.corporate)>0);
      assert.deepEqual(errors,[]);
      console.log('PASS: disabled mode — archive payment, corporate verification and sale, corporate linking, mixed-history shift reconciliation');
      return;
    }

    const other = await api('POST','/veresiye/customers',{
      full_name:'Browser other '+Date.now(),tc_no:tc(),phone:'05000000000',
    });
    await api('POST','/transactions',{
      shift_id:fixture.shift_id,type:'fuel',payment_method:'veresiye',amount:'300.00',
      liters:'5',fuel_type:'Motorin',credit:{account_type:'individual',credit_customer_id:other.id},
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button',{name:'Bireysel Müşteriler',exact:true}).click();
    const summary = () => page.locator('body').innerText().then(t=>t.split('Kurumsal Şirketler')[0]);
    const before = await summary();
    await page.getByPlaceholder('Ad soyad, telefon veya plaka ile ara...').fill('NO-MATCH-'+Date.now());
    await page.waitForResponse(r=>r.url().includes('/veresiye/customers?search=')&&r.status()===200);
    assert.equal(await summary(),before);
    await page.getByPlaceholder('Ad soyad, telefon veya plaka ile ara...').fill('');
    await page.getByText(fixture.customer.full_name,{exact:true}).waitFor();

    let release, requested;
    const gate = new Promise(r=>release=r);
    const arrived = new Promise(r=>requested=r);
    const pattern = '**/api/veresiye/customers/'+fixture.customer.id;
    await page.route(pattern,async route=>{
      const response = await route.fetch({url:apiOrigin+'/api/veresiye/customers/'+fixture.customer.id});
      requested(); await gate; await route.fulfill({response});
    });
    await page.getByText(fixture.customer.full_name,{exact:true}).click();
    await arrived;
    await page.getByRole('button',{name:'Kapat',exact:true}).click();
    await page.getByText(other.full_name,{exact:true}).click();
    await page.getByRole('heading',{name:other.full_name,exact:true}).waitFor();
    release(); await page.waitForLoadState('networkidle');
    await page.getByRole('heading',{name:other.full_name,exact:true}).waitFor();
    stage = 'payment limit and small viewport';
    const openPayment = page.getByRole('button',{name:'Tahsilat Kaydet',exact:true});
    await openPayment.click();
    const dialog = page.getByRole('dialog',{name:'Tahsilat Kaydet',exact:true});
    const amount = dialog.getByLabel('Tutar (₺)',{exact:true});
    const savePayment = dialog.getByRole('button',{name:'Kaydet',exact:true});
    await page.waitForFunction(()=>document.activeElement?.id==='payment-amount');
    for (const viewport of [{width:320,height:568}, {width:667,height:375}]) {
      await page.setViewportSize(viewport);
      const form = await dialog.locator('form').boundingBox();
      const save = await savePayment.boundingBox();
      assert(form.x>=0 && form.y>=0 && form.x+form.width<=viewport.width && form.y+form.height<=viewport.height,
        `Payment form exceeds viewport: ${JSON.stringify({viewport,form})}`);
      assert(save.y+save.height<=viewport.height, 'Save button is below the viewport');
      const documentWidth = await page.evaluate(()=>document.documentElement.scrollWidth);
      if (documentWidth>viewport.width) {
        const overflowing = await page.evaluate(()=>Array.from(document.querySelectorAll('header, header button, main, main div'))
          .filter(el=>el.getBoundingClientRect().right>innerWidth && el.getBoundingClientRect().width>0)
          .slice(0,8).map(el=>[el.tagName,el.className,Math.round(el.getBoundingClientRect().right)]));
        assert.fail(`Page scroll width ${documentWidth} exceeds ${viewport.width}: ${JSON.stringify(overflowing)}`);
      }
      await dialog.locator('#payment-note').fill('Small screen payment');
      assert(await savePayment.isVisible());
    }
    await amount.press('Escape');
    await dialog.waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='Tahsilat Kaydet');
    await openPayment.click();
    await dialog.getByText(/Tahsil edilebilir tutar.*300/).waitFor();
    await amount.fill('305');
    await dialog.getByRole('alert').getByText('Tahsilat tutarı güncel borcu aşamaz.').waitFor();
    assert(await savePayment.isDisabled());
    await amount.fill('300');
    const [response] = await Promise.all([
      page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/veresiye/payments')),
      savePayment.click(),
    ]);
    assert.equal(response.status(),201);
    const request = response.request();
    assert.equal(request.postDataJSON().credit_customer_id,other.id);
    assert(request.headers()['idempotency-key']);
    await dialog.waitFor({state:'detached'});
    const settled = await api('GET','/veresiye/customers/'+other.id+'/statement');
    assert.equal(settled.balance.balance,'0.00');
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'Kapat',exact:true}).click();
    await page.unroute(pattern);

    await page.getByText(fixture.customer.full_name,{exact:true}).click();
    await page.getByRole('button',{name:'Sonraki',exact:true}).waitFor();
    for(let i=0;i<4;i++) {
      const response = page.waitForResponse(r=>r.url().includes('/veresiye/payments?')&&r.url().includes('offset='+((i+1)*50)));
      await page.getByRole('button',{name:'Sonraki',exact:true}).click(); await response;
    }
    await page.getByText('201–203 / 203',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Kapat',exact:true}).click();

    stage = 'customer photo';
    await page.getByRole('button',{name:'Yeni Müşteri',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='cust-name');
    const photoName = 'Browser photo '+Date.now();
    await page.locator('#cust-name').fill(photoName);
    await page.locator('#cust-tc').fill(tc());
    await page.locator('#cust-phone').fill('05000000000');
    assert.equal(await page.locator('#cust-name').inputValue(),photoName);
    assert.equal(await page.locator('#cust-phone').inputValue(),'05000000000');
    await page.locator('#cust-id-photo').setInputFiles({name:'photo.heic',mimeType:'image/heic',buffer:Buffer.from('invalid-heic')});
    await page.getByRole('button',{name:'Kaydet',exact:true}).click();
    await page.getByText('Müşteri kaydedildi; fotoğraf yüklenemedi.',{exact:false}).waitFor();
    assert(await page.locator('#cust-name').isDisabled());
    await page.locator('#cust-id-photo').setInputFiles({name:'photo.png',mimeType:'image/png',
      buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
    await page.getByRole('button',{name:'Fotoğrafı tekrar yükle',exact:true}).click();
    await page.getByRole('button',{name:'Kimlik Fotoğrafını Görüntüle',exact:true}).waitFor();
    const saved = await api('GET','/veresiye/customers?search='+encodeURIComponent(photoName));
    assert.equal(saved.length,1);assert(saved[0].has_id_photo);
    await page.getByRole('button',{name:'Kapat',exact:true}).click();

    stage = 'sale';
    await page.goto(base+'/transactions');await page.waitForLoadState('networkidle');
    await page.getByRole('button',{name:'Yeni Satış Kaydı',exact:true}).click();
    await page.getByPlaceholder('850.00').fill('1000');
    await page.getByPlaceholder('18.80').fill('20');
    assert.equal(await page.getByPlaceholder('850.00').inputValue(),'1000');
    await page.getByRole('button',{name:/Veresiye/}).click();
    await page.getByRole('button',{name:'Bireysel',exact:true}).click();
    await page.getByPlaceholder('Örn. Ahmet Yılmaz veya 06ABC123...').fill(other.full_name);
    await page.getByRole('button',{name:new RegExp(other.full_name)}).click();
    assert.equal(await page.getByPlaceholder('850.00').inputValue(),'1000');
    assert.equal(await page.getByPlaceholder('18.80').inputValue(),'20');
    await page.getByPlaceholder('Örn: 06 ABC 123').fill('06NEW999');
    const sale = page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/transactions'));
    await page.getByRole('button',{name:'Satışı Kaydet',exact:true}).click();
    const saleResponse = await sale;assert.equal(saleResponse.status(),201);
    const body = await saleResponse.json();assert.equal(body.credit_sale.plate,'06NEW999');
    assert.equal(body.amount,'1000.00');assert.equal(body.liters,'20.000');
    await page.getByRole('button',{name:'Daha Sonra Yükle',exact:true}).click();

    stage = 'company selection';
    const companies = [];
    for(let i=0;i<2;i++) companies.push(await api('POST','/veresiye/companies',{
      name:'Browser company '+i+' '+Date.now(),
      vehicles:[{plate:'06Q'+i+String(Date.now()).slice(-6)}],
      drivers:[{full_name:'Browser driver '+i,tc_no:tc()}],
    }));
    await page.goto(base+'/transactions');await page.waitForLoadState('networkidle');
    const row = page.getByText('AUDIT BROWSER UNLINKED',{exact:true}).locator('xpath=ancestor::tr');
    await row.getByRole('button',{name:'Hesaba Bağla',exact:true}).click();
    const selects = page.locator('form select');
    await selects.first().selectOption(companies[0].id);
    await page.locator('option[value="'+companies[0].vehicles[0].id+'"]').waitFor({state:'attached'});
    await selects.nth(1).selectOption(companies[0].vehicles[0].id);
    await selects.nth(2).selectOption(companies[0].drivers[0].id);
    await selects.first().selectOption(companies[1].id);
    await page.locator('option[value="'+companies[1].vehicles[0].id+'"]').waitFor({state:'attached'});
    assert.equal(await selects.nth(1).inputValue(),'');assert.equal(await selects.nth(2).inputValue(),'');
    const [linked] = await Promise.all([
      page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/veresiye/sales/link')),
      page.locator('form button[type=submit]').click(),
    ]);
    assert.equal(linked.status(),201);
    const linkData = linked.request().postDataJSON();
    assert.equal(linkData.credit_company_id,companies[1].id);
    assert.equal(linkData.vehicle_id,undefined);assert.equal(linkData.driver_id,undefined);

    stage = 'dashboard refresh';
    await page.goto(base+'/');await page.waitForLoadState('networkidle');
    await page.getByRole('button',{name:'Satış Ekle',exact:true}).click();
    await page.getByRole('button',{name:'Tüm Pompalar',exact:true}).waitFor();
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('850.00').fill('1500');
    await page.getByPlaceholder('18.80').fill('25');
    assert.equal(await page.getByPlaceholder('850.00').inputValue(),'1500');
    assert.equal(await page.getByPlaceholder('18.80').inputValue(),'25');
    // A real language-context update rerenders Dashboard and its inline shift array.
    await page.getByRole('button',{name:'EN',exact:true}).evaluate(button=>button.click());
    await page.getByRole('button',{name:'TR',exact:true}).evaluate(button=>button.click());
    assert.equal(await page.getByPlaceholder('850.00').inputValue(),'1500');
    assert.equal(await page.getByPlaceholder('18.80').inputValue(),'25');
    await page.getByRole('button',{name:'Vazgeç',exact:true}).click();
    stage = 'mobile layout';
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/veresiye');await page.waitForLoadState('networkidle');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS: overpayment, exact settlement, mobile payment, search totals, stale account, 203-record history, photo retry, sale amounts/plate, company switch, dashboard rerender');
  } catch(e) {
    throw new Error(stage+': '+e.message);
  } finally {
    if (page) await page.unrouteAll({behavior:'ignoreErrors'});
    await browser.close();
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
