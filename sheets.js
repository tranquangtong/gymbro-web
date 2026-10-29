import {SCHEMAS,deserialize,serialize,validateRecord,emptyData} from './core.js';

const API='https://sheets.googleapis.com/v4/spreadsheets/';
export const SHEETS_SCOPE='https://www.googleapis.com/auth/spreadsheets';
export function spreadsheetId(input) { const value=String(input||'').trim();const match=value.match(/\/spreadsheets\/d\/([\w-]+)/); const id=match?match[1]:value;if(!/^[\w-]{20,}$/.test(id))throw Error('Hãy nhập link Google Sheets hoặc spreadsheet ID hợp lệ.');return id; }
export function authorize(clientId) {
  return new Promise((resolve,reject)=>{
    if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))return reject(Error('OAuth Client ID không đúng định dạng.'));
    if(!globalThis.google?.accounts?.oauth2)return reject(Error('Thư viện Google chưa tải được. Kiểm tra mạng rồi thử lại.'));
    const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SHEETS_SCOPE,callback:r=>{
      if(r.error)return reject(Error('Google từ chối cấp quyền: '+r.error));
      if(!google.accounts.oauth2.hasGrantedAllScopes(r,SHEETS_SCOPE))return reject(Error('Chưa được cấp quyền đọc/ghi Sheets.'));
      resolve({value:r.access_token,expiresAt:Date.now()+Number(r.expires_in)*1000});
    },error_callback:e=>reject(Error(e.type==='popup_closed'?'Cửa sổ đăng nhập đã đóng.':'Không mở được đăng nhập Google. Hãy cho phép popup.'))});
    client.requestAccessToken({prompt:'select_account'});
  });
}

export class SheetsRepository {
  constructor(id,token) { this.id=spreadsheetId(id); this.token=token; }
  async request(path='',options={}) {
    if(!this.token||Date.now()>this.token.expiresAt-15000)throw Error('Phiên Google đã hết hạn. Vào Kết nối để đăng nhập lại; nội dung đang nhập vẫn được giữ.');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),25000);
    try {
      const response=await fetch(API+this.id+path,{...options,signal:abort.signal,headers:{Authorization:'Bearer '+this.token.value,'Content-Type':'application/json',...options.headers}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) {
        const error=Error(response.status===401?'Phiên Google đã hết hạn. Hãy kết nối lại.':response.status===403?'Không có quyền truy cập. Kiểm tra tài khoản, quyền chỉnh sửa file và việc bật Sheets API.':response.status===429?'Đã chạm giới hạn Sheets API. Chờ một lúc rồi làm mới.':body.error?.message||'Google Sheets trả về lỗi.');
        error.status=response.status; throw error;
      }
      return body;
    } catch(e) { if(e.name==='AbortError')throw Error('Google Sheets phản hồi quá lâu. Chưa xác nhận được kết quả.');throw e; } finally {clearTimeout(timer);}
  }
  async inspect() {
    const meta=await this.request('?fields=properties(title),sheets(properties(sheetId,title))');
    this.title=meta.properties.title;
    return {title:this.title,missing:Object.keys(SCHEMAS).filter(t=>!meta.sheets.some(s=>s.properties.title===t))};
  }
  async initialize() {
    const {missing}=await this.inspect();
    // Add sheet and header in one atomic batch; never overwrite an existing tab.
    if(missing.length) {
      const requests=missing.flatMap((title,i)=>{const id=100000+Math.floor(Math.random()*100000000)+i;return [
        {addSheet:{properties:{title,sheetId:id,gridProperties:{frozenRowCount:1}}}},
        {updateCells:{start:{sheetId:id,rowIndex:0,columnIndex:0},rows:[{values:SCHEMAS[title].map(h=>({userEnteredValue:{stringValue:h}}))}],fields:'userEnteredValue'}},
        {repeatCell:{range:{sheetId:id,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:0.15,green:0.30,blue:0.23},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat'}}
      ];});
      await this.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
    }
    return this.load();
  }
  async readTable(table) {
    const result=await this.request('/values/'+encodeURIComponent("'"+table+"'!A:Z")+'?valueRenderOption=UNFORMATTED_VALUE');
    const rows=result.values||[],headers=rows[0]||[];
    if(!SCHEMAS[table].every((h,i)=>headers[i]===h))throw Error('Header của tab '+table+' khác cấu trúc GymBro Web. Không ghi để tránh hỏng dữ liệu.');
    return rows.slice(1).map((values,i)=>({...deserialize(table,values),_row:i+2})).filter(r=>r.id);
  }
  async load() {
    const data=emptyData();const tables=Object.keys(SCHEMAS);const rows=await Promise.all(tables.map(t=>this.readTable(t)));tables.forEach((t,i)=>data[t]=rows[i]);return data;
  }
  async save(table,record) {
    validateRecord(table,record);
    // Find by stable ID using a fresh read. Repeated submission of a confirmed ID updates it.
    const rows=await this.readTable(table),existing=rows.find(r=>r.id===record.id);
    if(existing&&JSON.stringify(serialize(table,existing))===JSON.stringify(serialize(table,record)))return;
    if(existing&&record._row&&existing.updated_at!==record._originalUpdatedAt)throw Error('Log đã thay đổi ở nơi khác. Hãy đóng form, làm mới và mở lại để sửa.');
    if(!existing&&record._row)throw Error('Log không còn trong Sheets. Hãy làm mới trước khi sửa.');
    const range=encodeURIComponent("'"+table+"'!A"+(existing?existing._row:1)+':'+String.fromCharCode(64+SCHEMAS[table].length)+(existing?existing._row:''));
    try {
      await this.request('/values/'+range+(existing?'?valueInputOption=RAW':':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'),{method:existing?'PUT':'POST',body:JSON.stringify({values:[serialize(table,record)]})});
    } catch(error) {
      if(error.status)throw error;
      // A lost response may follow a successful write. Reconcile; never blindly retry append.
      try { const confirmed=(await this.readTable(table)).find(r=>r.id===record.id); if(confirmed&&JSON.stringify(serialize(table,confirmed))===JSON.stringify(serialize(table,record)))return; }catch{}
      const uncertain=Error('Chưa xác nhận được việc lưu. Giữ nguyên form và bấm Lưu lại khi có mạng; ứng dụng sẽ kiểm tra ID trước khi ghi để hạn chế trùng.');uncertain.uncertain=true;throw uncertain;
    }
  }
}
