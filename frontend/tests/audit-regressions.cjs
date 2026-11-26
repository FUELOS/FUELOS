/* Run only with the disposable fixtures emitted by backend/test_audit_api.py.
 * Requires Playwright in the QA environment; no application dependency is added.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = JSON.parse(fs.readFileSync(process.env.AUDIT_BROWSER_FIXTURE_PATH, 'utf8'));
const base = process.env.AUDIT_FRONTEND_URL || 'http://127.0.0.1:5173';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
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
    const login = await context.request.post('http://127.0.0.1:8000/api/auth/login', {
      data:{email:fixture.manager_email,password:'AuditOnly2026!'},
    });
    assert.equal(login.status(),200);
    const token = (await login.json()).access_token;
    const headers = {Authorization:'Bearer '+token};
    const api = async (method, path, data) => {
      const response = await context.request.fetch('http://127.0.0.1:8000/api'+path,{method,headers,data});
      assert(response.ok(), `${method} ${path}: ${response.status()}`);
      return response.json();
    };
    const other = await api('POST','/veresiye/customers',{
      full_name:'Browser other '+Date.now(),tc_no:tc(),phone:'05000000000',
    });
    await context.addInitScript(token => {
      localStorage.setItem('fuelos_token',token);
      localStorage.setItem('fuelos_lang','tr');
    },token);
    await page.route('**/api/**',async route=>{
      const u = new URL(route.request().url());
      const response = await route.fetch({url:'http://127.0.0.1:8000'+u.pathname+u.search});
      await route.fulfill({response});
    });
    await page.goto(base+'/veresiye');
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
      const response = await route.fetch({url:'http://127.0.0.1:8000/api/veresiye/customers/'+fixture.customer.id});
      requested(); await gate; await route.fulfill({response});
    });
    await page.getByText(fixture.customer.full_name,{exact:true}).click();
    await arrived;
    await page.getByRole('button',{name:'Kapat',exact:true}).click();
    await page.getByText(other.full_name,{exact:true}).click();
    await page.getByRole('heading',{name:other.full_name,exact:true}).waitFor();
    release(); await page.waitForLoadState('networkidle');
    await page.getByRole('heading',{name:other.full_name,exact:true}).waitFor();
    await page.getByRole('button',{name:'Tahsilat Kaydet',exact:true}).click();
    await page.getByPlaceholder('0.00').fill('1');
    const sent = page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/veresiye/payments'));
    await page.getByRole('button',{name:'Kaydet',exact:true}).click();
    const request = await sent;
    assert.equal(request.postDataJSON().credit_customer_id,other.id);
    assert(request.headers()['idempotency-key']);
    await page.getByPlaceholder('0.00').waitFor({state:'detached'});
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
    console.log('PASS: search totals, stale account/payment, 203-record history, photo retry, sale amounts/plate, company switch, dashboard rerender, mobile overflow');
  } catch(e) {
    throw new Error(stage+': '+e.message);
  } finally {
    if (page) await page.unrouteAll({behavior:'ignoreErrors'});
    await browser.close();
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
