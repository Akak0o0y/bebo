const { randomUUID } = require('node:crypto');
const allowedKeys = new Set(['ENTER','ESC','TAB','BACKSPACE','DELETE','SPACE','UP','DOWN','LEFT','RIGHT','HOME','END','PAGEUP','PAGEDOWN','WIN','CTRL+A','CTRL+C','CTRL+V','CTRL+L','CTRL+F','CTRL+S','CTRL+N','CTRL+T','CTRL+W','ALT+TAB','ALT+F4','WIN+E','WIN+D','WIN+S']);
function validateAction(action) {
  if (!action || typeof action !== 'object' || !['click','double_click','type','key','scroll','tool','done','blocked','ask'].includes(action.type)) throw new Error('Unsupported desktop action.');
 if (typeof action.reason !== 'string' || action.reason.length > 2000 || !action.reason.trim()) throw new Error('The action needs an explanation.');
  if (typeof action.text !== 'string' || action.text.length > (action.type==='tool'?40000:4000)) throw new Error('Action text is invalid or too long.');
 if (!Number.isInteger(action.x) || !Number.isInteger(action.y) || action.x < 0 || action.y < 0 || action.x > 1000 || action.y > 1000) throw new Error('Cursor coordinates must be between 0 and 1000.');
 if (action.type === 'key' && !allowedKeys.has(action.text)) throw new Error('That keyboard shortcut is not supported.');
 if (action.type === 'scroll' && !['up','down'].includes(action.text)) throw new Error('Scroll direction must be up or down.');
 return {type:action.type,x:action.x,y:action.y,text:action.text,reason:action.reason};
}
class QuestionGate {
 constructor(){this.pending=null;}
 issue(action,step){if(action?.type!=='ask')throw new Error('Expected a question.');this.pending={id:randomUUID(),action:validateAction(action),step,expires:Date.now()+15*60*1000};return {id:this.pending.id,action:this.pending.action,step};}
 consume(id,answer){
  const pending=this.pending;
  if(!pending||pending.id!==id)throw new Error('That question has already been answered or replaced.');
  if(Date.now()>=pending.expires){this.pending=null;throw Object.assign(new Error('This question expired. Start the request again.'),{code:'QUESTION_EXPIRED'});}
  if(typeof answer!=='string'||!answer.trim()||answer.length>2000)throw new Error('Enter an answer under 2,000 characters.');
  this.pending=null;return {question:pending.action.reason,answer:answer.trim()};
 }
 clear(){this.pending=null;}
}
class ApprovalGate {
 constructor(){this.pending=null;}
 issue(action,step,context){this.pending={id:randomUUID(),action:validateAction(action),step,context,expires:Date.now()+120000};return {id:this.pending.id,action:this.pending.action,step};}
 consume(id){const pending=this.pending;if(!pending||pending.id!==id)throw new Error('This action is no longer pending.');if(pending.action.type==='ask')throw new Error('Answer the question before continuing.');this.pending=null;if(Date.now()>=pending.expires)throw Object.assign(new Error('This action expired. Send the request again for a fresh view.'),{code:'APPROVAL_EXPIRED'});return pending;}
 clear(){this.pending=null;}
}
module.exports={validateAction,ApprovalGate,QuestionGate,allowedKeys};
