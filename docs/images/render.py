"""Regenerate original diagrams. Requires Python 3; PNG export needs Inkscape.
No network resources, scripts, embedded fonts, or external images in SVGs.
"""
from pathlib import Path
from html import escape
import subprocess, shutil
ROOT=Path(__file__).parent
C={'bg':'#080e20','panel':'#101b32','line':'#293957','text':'#f1f5ff','muted':'#9cacc8','cyan':'#61e6ed','violet':'#ae91ff'}
def text(x,y,s,size=24,color='text',weight=400):
 return f'<text x="{x}" y="{y}" font-size="{size}" fill="{C.get(color,color)}" font-weight="{weight}">{escape(s)}</text>'
def rect(x,y,w,h,fill='panel',stroke='line',r=18):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{C.get(fill,fill)}" stroke="{C.get(stroke,stroke)}"/>'
def line(x1,y1,x2,y2,color='cyan'):
 return f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{C[color]}" stroke-width="2" fill="none" marker-end="url(#arrow)"/>'
def start(title,h=600):
 return [f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{h}" viewBox="0 0 1200 {h}" role="img" aria-label="{escape(title)}"><title>{escape(title)}</title><defs><linearGradient id="g"><stop stop-color="#61e6ed"/><stop offset="1" stop-color="#ae91ff"/></linearGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#61e6ed"/></marker></defs><g font-family="DejaVu Sans, Noto Sans CJK SC, sans-serif">',rect(0,0,1200,h,'bg','bg',0),'<path d="M0,2 H1200" stroke="url(#g)" stroke-width="4"/>']
def save(name,parts):
 p=ROOT/(name+'.svg');p.write_text(''.join(parts)+'</g></svg>',encoding='utf-8')
 if shutil.which('inkscape'): subprocess.run(['inkscape',str(p),'--export-type=png','--export-filename='+str(ROOT/(name+'.png'))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for zh in [False,True]:
 suffix='.zh-CN' if zh else ''
 def t(en,cn):return cn if zh else en
 p=start('Ego Lite Test Skill',540)
 p += [text(54,64,'EGO LITE / TEST SKILL',19,'cyan',700),text(54,136,t('Intent stays stable.','目标稳定。'),48,'text',700),text(54,198,t('The path can adapt.','路径可以自适应。'),48,'text',700),text(56,246,t('Model-led testing. Native browser actions. Reviewable evidence.','模型自主决策 · 原生浏览器操作 · 可复核证据'),20,'muted')]
 p += [rect(56,294,1088,150),text(82,332,t('01  DEFINE','01  定义'),16,'cyan',700),text(82,370,t('Goals + acceptance','目标与验收条件'),23),text(82,403,t('Project-owned resources','项目维护的测试资源'),17,'muted'),text(455,332,t('02  ADAPT','02  自适应'),16,'violet',700),text(455,370,t('Observe → decide → act','观察 → 判断 → 行动'),23),text(455,403,t('Current Codex model + Ego','当前 Codex 模型 + Ego'),17,'muted'),text(835,332,t('03  VERIFY','03  验证'),16,'cyan',700),text(835,370,t('Evidence + verdict','证据与结论'),23),text(835,403,t('Uncertainty stays visible','明确保留不确定性'),17,'muted'),line(355,370,420,370),line(735,370,800,370),text(56,498,t('EXPERIMENTAL 0.1.3-dev  /  UNOFFICIAL  /  WINDOWS + EGO VALIDATION PENDING','实验版 0.1.3-dev  /  非官方项目  /  Windows + Ego 实机验证待完成'),16,'muted')]
 save('hero'+suffix,p)
 p=start(t('Who owns what?','谁负责什么？'),650)
 p += [text(50,65,t('A small skill. Clear boundaries.','轻量 Skill，清晰边界。'),35,'text',700),text(50,103,t('No second model service. No browser engine inside the helper.','不另建模型服务，不在辅助工具中重造浏览器引擎。'),20,'muted')]
 cards=[(430,'02',t('Current Codex model','当前 Codex 模型'),[t('Interprets the requirement','理解测试需求'),t('Chooses the next action','选择下一步动作'),t('Evaluates evidence','判断证据是否充分')],'cyan'),(50,'01',t('Skill + project resources','Skill + 项目资源'),[t('Boundaries and acceptance','授权边界与验收条件'),t('Fixtures and reusable context','测试数据与可复用上下文'),t('Optional artifact helper','可选：运行产物辅助工具')],'violet'),(810,'03',t('Ego native browser','Ego 原生浏览器'),[t('Reads the current page','读取当前页面'),t('Performs browser actions','执行浏览器操作'),t('Returns observations','返回页面观察结果')],'cyan')]
 for x,n,head,rows,col in cards:
  p += [rect(x,150,340,268),text(x+24,192,n,20,col,700),text(x+24,236,head,22,'text',700)]
  p += [text(x+24,284+i*38,r,19,'muted') for i,r in enumerate(rows)]
 p += [line(390,276,428,276),line(770,260,808,260),line(808,302,770,302),text(78,444,t('Provides context →','提供上下文 →'),16,'violet'),text(454,444,t('Decisions ↔ browser observations','模型决策 ↔ 浏览器观察'),16,'cyan'),rect(50,462,1100,130),text(78,503,t('The helper owns files, not decisions.','辅助工具管理文件，不替模型决策。'),23,'cyan',700),text(78,543,t('init / start / check / report never launch a model or a browser.','init / start / check / report 不启动模型，也不启动浏览器。'),21),text(78,574,t('Observed UI state is evidence, not an independent business oracle.','页面观察是证据，不是独立的业务正确性判定器。'),18,'muted')]
 save('architecture'+suffix,p)
 p=start(t('Adaptive test workflow','自适应测试流程'),780)
 p += [text(50,65,t('A loop, not a recorded click sequence.','观察与调整，而不是机械回放。'),34,'text',700),text(50,103,t('Two input sources. One case format. New features and regression.','两种用例来源，一套格式；共同用于新功能与回归验证。'),20,'muted')]
 p += [rect(50,130,535,84),text(70,162,t('External cases → validate format','接收外部用例 → 校验统一格式'),21,'cyan',700),text(70,193,t('Business steps + overall acceptance','业务步骤 + 整体验收目标'),17,'muted'),rect(615,130,535,84),text(635,162,t('Skill authors cases → validate format','Skill 生成用例 → 校验统一格式'),21,'violet',700),text(635,193,t('Optional step checkpoints, no invented UI','每步检查点可选，不虚构界面细节'),17,'muted'),'<g transform="translate(0 120)">']
 heads=[t('Observe','观察'),t('Decide','判断'),t('Act','行动'),t('Verify','验证')]
 subs=[t('Read current state','读取当前状态'),t('Choose next step','选择下一步'),t('Use native Ego','使用 Ego 原生操作'),t('Compare with criteria','对照验收条件')]
 for i in range(4):
  x=50+i*285;p += [rect(x,160,245,160),text(x+24,201,'0'+str(i+1),17,'cyan'),text(x+24,244,heads[i],30,'text',700),text(x+24,285,subs[i],18,'muted')]
  if i<3:p += [line(x+247,240,x+282,240)]
 p += ['<path d="M1027,324 V368 H173 V324" fill="none" stroke="#ae91ff" stroke-width="2"/>',text(345,400,t('Need more evidence? Re-observe, within budget.','证据不足？在预算内重新观察。'),21,'violet')]
 p += [rect(50,443,1100,172),text(78,484,t('Stop honestly','如实停止'),24,'cyan',700),text(78,524,t('Pass only with evidence. Failure, blockers, and uncertainty are separate outcomes.','通过必须有证据；失败、阻塞与不确定结果不能混为一谈。'),20),text(78,558,t('Unapproved high-risk action or permission boundary → pause that action and ask.','未授权的高风险操作或授权边界：暂停该操作并询问。'),18,'muted'),text(78,590,t('Missing oracle → withhold the affected verdict; continue other authorized checks.','缺少验收判据：保留受影响的结论，继续其他已授权检查。'),18,'muted')]
 p += ['</g>']
 save('workflow'+suffix,p)
 p=start(t('Illustrative evidence specimen, not a real run','证据展示示意，非真实运行结果'),620)
 p += [text(50,59,'ILLUSTRATIVE / NOT A REAL RUN',18,'violet',700),text(50,109,t('An honest result is more than a green badge.','可信结果，不只是一枚绿色徽章。'),33,'text',700),rect(50,145,1100,395),text(78,190,t('CASE  /  Catalog search','用例  /  商品目录搜索'),24,'text',700),text(78,228,t('Expected: every visible result matches the requested category.','预期：当前可见结果均符合请求的分类。'),20,'muted')]
 p += [rect(78,261,500,188,'bg'),text(100,300,t('OBSERVED','观察所得'),15,'cyan',700),text(100,342,t('The result list is visible.','结果列表已显示。'),23),text(100,381,t('Visible labels were inspected.','已检查当前可见的标签。'),20,'muted'),text(100,418,t('Evidence reference: sanitized page capture','证据引用：已脱敏的页面记录'),17,'muted'),rect(602,261,520,188,'bg'),text(624,300,t('NOT ESTABLISHED','尚未证实'),15,'violet',700),text(624,342,t('Backend data correctness.','后端数据是否正确。'),23),text(624,381,t('Unseen or paginated records.','未显示或位于后续分页的记录。'),20,'muted'),text(624,418,t('No evidence → no wider claim','没有证据，不扩大结论'),17,'muted'),text(78,496,t('Verdict: needs review until the acceptance evidence is sufficient.','结论：验收证据充分之前，仍需复核。'),22,'cyan'),text(50,583,t('Synthetic design specimen only. No product execution, screenshot, or benchmark is represented.','仅为人工设计示意，不代表产品实测、真实截图或基准测试。'),17,'muted')]
 save('result-specimen'+suffix,p)
