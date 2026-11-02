/** Generic Markdown display. Outside content never supplies report controls or executable HTML. */
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
const parser=new Marked({gfm:true,breaks:true,renderer:{html:({text})=>escape(text),image:({text})=>'<span>[图片：'+escape(text)+'；外部图片不自动加载]</span>'}});
export function renderMarkdown(content:string):string{
  if(typeof document==='undefined'||!DOMPurify.isSupported)return '<pre>'+escape(content)+'</pre>';
  const html=parser.parse(content,{async:false});
  const clean=DOMPurify.sanitize(html,{ALLOWED_TAGS:['p','br','strong','em','del','blockquote','pre','code','h1','h2','h3','h4','h5','h6','ul','ol','li','hr','table','thead','tbody','tr','th','td','a','span'],ALLOWED_ATTR:['href','title','colspan','rowspan','align'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_TRUSTED_TYPE:false});
  const template=document.createElement('template');template.innerHTML=clean;
  for(const a of template.content.querySelectorAll('a')){const href=a.getAttribute('href')??'';if(!/^https?:\/\//i.test(href)){a.removeAttribute('href');continue;}a.setAttribute('rel','noopener noreferrer');a.setAttribute('target','_blank');}
  return template.innerHTML;
}
