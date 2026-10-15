'use strict';
// Dedicated review server. Never connect this entry point to production credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const forbidden = /^(SUPABASE_|SMTP_|GOOGLE_|GMAIL_|OPENAI_|TENCENT|MAIL_TRANSPORT)/;
for (const key of Object.keys(process.env)) if (forbidden.test(key)) delete process.env[key];
process.env.SUPABASE_REQUIRED = 'false';
process.env.CRMZONA_DESIGN_PREVIEW = 'true';
const { Store, createRequestHandler } = require('../lib/app');
// Also clear anything loaded by the application's optional .env reader.
for (const key of Object.keys(process.env)) if (forbidden.test(key)) delete process.env[key];
const dataDir = process.env.PREVIEW_DATA_DIR || path.join(os.tmpdir(), 'crmzona-design-preview-v3');
const store = new Store(dataDir);
const month = new Date().toISOString().slice(0,7);
if (!store.listUsers().length) {
  store.saveRetailPoints([
    {id:'demo_center',name:'Центральная · DEMO',address:'Демонстрационная улица, 12',rentCost:'65000'},
    {id:'demo_park',name:'Парковая · DEMO',address:'Примерный проспект, 8',rentCost:'48000'},
    {id:'demo_river',name:'Речная · DEMO',address:'Тестовая набережная, 24',rentCost:'54000'},
    {id:'demo_north',name:'Северная · DEMO',address:'Учебный проезд, 3',rentCost:'42000'},
  ]);
  store.saveCompanies([{id:'demo_company',name:'ООО «Пример»',shortName:'Пример',inn:'',pointIds:['demo_center','demo_park'],taxRate:'8'}]);
  const owner = store.createUser({fullName:'Демо Алексей Сергеевич',phone:'+79990000001',email:'demo@example.com',password:'DesignPreview2026!',position:'Руководитель'});
  const names=['Иванова Анна Сергеевна','Смирнов Максим Андреевич','Петрова Елена Игоревна','Волков Дмитрий Олегович','Соколова Мария Павловна','Орлов Никита Романович'];
  const users = names.map((fullName,i)=>store.createUser({fullName,phone:'+799900000'+String(i+10),email:`employee${i+1}@example.com`,password:'DesignPreview2026!',role:'employee',position:'Оператор пункта выдачи',officialSalary:'45000',hireDate:'2026-09-01',allowedSections:['schedule','tasks'],allowedPoints:['demo_center','demo_park']}));
  const days = new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const schedule = store.getSchedule('demo_center',month,store.listUsers()[0]);
  schedule.rows = schedule.rows.map((row,i)=>({...row,days:Object.fromEntries(Array.from({length:days},(_,d)=>[String(d+1),(d+i)%4<2?{rateRub:'2300',issuedCount:String(80+d*3)}:{}]))}));
  store.saveSchedule(store.listUsers()[0],'demo_center',month,schedule.rows);
  const date = month+'-20';
  store.saveJson('tasks.json',[
    {id:'demo_task_1',title:'Проверить готовность точек к выходным',assigneeId:users[0].id,priority:'normal',deadline:date,description:'Проверить расходные материалы и порядок в клиентской зоне.',createdBy:owner.id,createdAt:new Date().toISOString(),attachments:[]},
    {id:'demo_task_2',title:'Согласовать график на следующую неделю',assigneeId:users[1].id,priority:'normal',deadline:date,description:'Собрать пожелания команды и проверить подмены.',createdBy:owner.id,createdAt:new Date().toISOString(),attachments:[]},
    {id:'demo_task_3',title:'Обновить информацию для сотрудников',assigneeId:users[2].id,priority:'normal',deadline:date,description:'Проверить контакты и рабочие инструкции.',createdBy:owner.id,createdAt:new Date().toISOString(),attachments:[]},
  ]);
}
const handler = createRequestHandler(store,{standardClient:true,healthchecks:true});
const server = http.createServer((req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  if (['/','/index.html','/stable.html','/design-capture'].includes((req.url || '').split('?')[0])) {
    let html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
    html=html.replace('<main class="app-shell is-hidden" id="appShell">','<main class="app-shell is-hidden" id="appShell"><div class="preview-banner">Тестовая версия · только демонстрационные данные · изменения не влияют на основной сайт</div>');
    html=html.replace('<div class="segmented"','<p class="preview-login-note">Тестовый вход: <strong>demo@example.com</strong><br>Пароль: <strong>DesignPreview2026!</strong><br>Не вводите здесь рабочие или персональные данные.</p><div class="segmented"');
    if (req.url.startsWith('/design-capture') && process.env.ENABLE_FIGMA_CAPTURE === 'true') html=html.replace('</body>','<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script></body>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(html);return;
  }
  // Live integrations are intentionally unavailable in this synthetic review environment.
  if (/^\/api\/(?:surveillance\/(?!cameras$|status$)|assistant\/message)/.test(req.url || '')) {
    res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:'В тестовом контуре внешние подключения отключены. Используются только демонстрационные данные.'}));return;
  }
  handler(req,res);
});
const port=Number(process.env.PORT || 8361);
server.listen(port,process.env.PREVIEW_HOST || '127.0.0.1',()=>console.log(`Design preview: http://127.0.0.1:${port}`));
