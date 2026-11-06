/** Shared report themes, approved overview and three-column case reader. */
export const caseReaderCss = `
.model-info{font-size:12px;line-height:1.7;overflow-wrap:anywhere;margin-top:7px}.model-info details{margin-top:4px}.model-info details p{font-size:11px;font-weight:400}.topbar>div:first-child{min-width:0}
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;background:var(--background);color:var(--ink);font:14px/1.75 'Segoe UI','Microsoft YaHei',system-ui,sans-serif;background-attachment:fixed}
button,input,select,textarea{font:inherit;color:inherit}
button,a{touch-action:manipulation}
button{cursor:pointer;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:7px 12px;transition:background .15s,border-color .15s}
button:hover{background:var(--surface);border-color:var(--accent)}
button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
button.primary{color:var(--panel);background:var(--ink);border-color:var(--ink)}
button.primary:hover{opacity:.88}
button:disabled{opacity:.45;cursor:not-allowed}
input[type=search],select,textarea{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:8px 10px}
textarea{resize:vertical;min-height:112px;width:100%;line-height:1.8}
a{color:var(--accent)}
h1,h2,h3,p{margin:0}
h1{font-size:22px;line-height:1.4;letter-spacing:.2px}
h2{font-size:21px;line-height:1.5}
h3{font-size:14px}
.muted{color:var(--muted)}
.small{font-size:12px}
.mono{font-family:Consolas,monospace;font-size:11px;overflow-wrap:anywhere}
.eyebrow{color:var(--accent);font-size:11px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase}
.topbar{padding:18px 26px 14px;background:var(--header);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:20px}
.titleline{display:flex;align-items:center;gap:12px}
.product-mark{width:34px;height:34px;border-radius:10px;background:var(--ink);color:var(--panel);display:grid;place-items:center;font-weight:700;font-size:13px}
.subtitle{font-size:12px;color:var(--muted);margin-top:5px}
.top-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.theme-control{position:relative;display:flex}
.theme-control>button:first-child{border-radius:8px 0 0 8px}
.theme-control>button:last-of-type{border-radius:0 8px 8px 0;border-left:0;padding:7px 8px}
.theme-menu{position:absolute;right:0;top:44px;z-index:80;width:270px;background:var(--panel);border:1px solid var(--line);padding:12px;border-radius:12px;box-shadow:0 16px 48px #0002}
.theme-menu[hidden]{display:none}
.theme-menu h3{margin:0 0 10px}
.theme-options{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.theme-options button{text-align:left;font-size:12px;padding:8px}
.swatch{display:inline-block;width:12px;height:12px;border:1px solid #0002;border-radius:50%;vertical-align:middle;margin-right:6px}
.theme-options [aria-pressed=true]{outline:2px solid var(--accent);outline-offset:1px}
.page-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 26px;border-bottom:1px solid var(--line);background:var(--panel);font-size:12px}
.metrics{display:flex;gap:24px;align-items:baseline}
.metrics b{font-size:20px;margin-right:4px;font-weight:650}
.metrics .divided{border-left:1px solid var(--line);padding-left:22px}
.phase{display:inline-flex;align-items:center;gap:7px;color:var(--accent)}
.phase:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent)}
.layout{display:grid;grid-template-columns:254px minmax(0,1fr);gap:20px;padding:20px 24px;max-width:1820px;margin:auto;align-items:start}
.sidebar{position:sticky;top:16px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.nav-head{padding:15px;border-bottom:1px solid var(--line)}
.nav-title{display:flex;align-items:center;justify-content:space-between;font-size:13px;margin-bottom:10px}
.icon-btn{padding:1px 7px;font-size:15px}
.search{width:100%;font-size:12px}
.filter{width:100%;font-size:12px;margin-top:8px;padding:6px 8px}
.nav-tools{display:flex;justify-content:space-between;margin-top:9px;gap:6px}
.text-btn{border:0;background:none;padding:0;color:var(--accent);font-size:11px}
.tree{overflow:auto;min-height:150px;padding:8px}
.scene{border-radius:7px;margin:2px 0}
.scene-head{display:flex;align-items:flex-start;gap:4px;padding:4px 3px}
.scene-head.current{background:var(--surface);border-radius:7px}
.scene-toggle{padding:4px;border:0;background:none;line-height:1.6;font-size:12px}
.scene-pick{flex:1;border:0;background:none;text-align:left;padding:4px 3px;line-height:1.6;font-weight:650;font-size:12px}
.scene-n{font-size:10px;color:var(--muted);display:block;font-weight:400;margin-top:3px}
.scene-goals{padding:3px 0 5px 21px;border-left:1px solid var(--line);margin-left:11px}
.point-nav{display:block;text-align:left;width:100%;padding:8px;border:1px solid transparent;background:none;margin:3px 0;font-size:12px;line-height:1.65}
.point-nav[aria-current=true]{border-color:var(--accent);background:var(--surface)}
.point-id{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:10px;margin-bottom:2px}
.note-dot{display:inline-block;width:6px;height:6px;background:var(--accent);border-radius:50%}
.nav-foot{font-size:10px;line-height:1.7;color:var(--muted);padding:10px 14px;border-top:1px solid var(--line)}
.content{min-width:0}
.breadcrumbs{font-size:11px;display:flex;justify-content:space-between;gap:10px;color:var(--muted);margin-bottom:12px}
.scene-banner{border:1px solid var(--line);border-radius:11px;padding:15px 19px;background:var(--header);margin-bottom:14px}
.scene-banner h2{font-size:18px;margin-top:4px}
.scene-banner p{font-size:12px;color:var(--muted);margin-top:5px}
.point-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.point-overview{padding:20px 23px;border-bottom:1px solid var(--line)}
.point-kicker{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.badges{display:flex;gap:6px;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;padding:2px 8px;background:var(--surface);border:1px solid var(--line);border-radius:20px;font-size:10px;white-space:nowrap}
.badge.warn{border-style:dashed}
.badge.review-approved{color:var(--verified-fg);background:var(--verified-bg);border-color:var(--verified-fg);font-weight:650}
.point-nav .review-approved{display:table;margin-top:6px}
.review-pass-button{color:var(--verified-fg);background:var(--verified-bg);border-color:var(--verified-fg)}
.review-pass-summary{padding:12px;border:1px solid var(--verified-fg);border-radius:8px;background:var(--verified-bg);color:var(--verified-fg);font-size:12px}
.review-pass-summary button{margin-top:10px}
.review-confirm-text{max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin-top:12px}
.pager-position{font-size:10px;color:var(--muted);align-self:center}
.target-number{font:11px/1.6 Consolas,monospace;color:var(--muted)}
.expected{font-size:14px;line-height:1.95;margin-top:13px;padding:13px 16px;background:var(--surface);border-radius:8px;border-left:3px solid var(--accent)}
.expected-label{display:block;font-size:10px;color:var(--accent);font-weight:700;letter-spacing:.8px;margin-bottom:3px}
.point-controls{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:10px;font-size:11px}
.point-controls label{display:flex;gap:5px;align-items:center;color:var(--muted)}
.pager{display:flex;gap:6px}
.pager button{font-size:11px;padding:4px 8px}
.point-body{padding:18px 23px}
.plan-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:24px}
.section-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
.section-caption{font-size:10px;color:var(--muted)}
.step{display:flex;align-items:flex-start;gap:11px;padding:12px 0;border-top:1px solid var(--line)}
.step:first-of-type{border-top:0}
.step-num{flex:0 0 25px;height:25px;border:1px solid var(--line);border-radius:50%;display:grid;place-items:center;font-size:10px;color:var(--accent);background:var(--surface)}
.step-text{font-size:12px;line-height:1.9}
.dependency{font-size:10px;color:var(--muted);margin-top:4px}
.required-tag{font-size:9px;padding:1px 6px;border:1px solid var(--line);border-radius:20px;white-space:nowrap;display:inline-block;margin-top:6px;color:var(--accent)}
.condition{font-size:12px;line-height:1.9;padding:10px 0;border-bottom:1px solid var(--line)}
.condition strong{font-size:11px;display:block;margin-bottom:3px;color:var(--accent)}
.condition:last-child{border:0}
.condition details{margin-top:2px}
.condition summary{cursor:pointer;font-size:11px;color:var(--accent)}
.path-block{padding:13px 14px;background:var(--surface);border-radius:8px;margin-top:13px;font-size:12px;line-height:1.9}
.path-block strong{display:block;font-size:11px;margin-bottom:4px}
.source-block{margin-top:20px;padding-top:15px;border-top:1px solid var(--line)}
.source-block summary,.tech summary{cursor:pointer;color:var(--muted);font-size:11px}
.source-block p{font-size:12px;line-height:1.9;margin-top:8px}
.tech{margin-top:12px;color:var(--muted)}
.tech pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.8 Consolas,monospace;max-height:220px;overflow:auto;background:var(--surface);padding:10px;border-radius:7px}
.questions{padding:12px 15px;background:var(--surface);border:1px dashed var(--accent);border-radius:8px;margin-bottom:16px}
.questions h3{font-size:12px}
.questions ul{padding-left:18px;font-size:12px;margin:6px 0 0}
.review-pane{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:19px 21px;margin-top:15px}
.review-pane h3{font-size:15px}
.review-lead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.review-context{font-size:11px;line-height:1.8;color:var(--muted);margin-top:4px}
.review-editor{min-height:105px}
.review-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;font-size:10px;color:var(--muted)}
.review-actions button{font-size:12px}
.draft-hint{font-size:10px;line-height:1.8;color:var(--muted);margin-top:8px}
.review-empty{font-size:12px;color:var(--muted);padding:10px 0}
.global-note{margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}
.global-note summary{font-size:12px;cursor:pointer}
.global-note textarea{margin-top:10px;min-height:90px}
.footer-note{font-size:10px;line-height:1.8;color:var(--muted);margin:15px 0}
.footer-note a{margin:0 4px}
.variant-B .layout{grid-template-columns:230px minmax(0,1fr) 298px;gap:16px}
.variant-B .review-pane{position:sticky;top:16px;margin-top:27px;padding:18px}
.variant-B .review-editor{min-height:245px}
.variant-B .plan-grid{grid-template-columns:1fr;gap:18px}
.variant-B .point-overview,.variant-B .point-body{padding:18px}
.variant-B h2{font-size:20px}
.variant-B .review-lead{display:block}
.variant-B .review-actions{align-items:flex-start;flex-wrap:wrap}
.variant-B .review-actions>div{width:100%;display:flex;justify-content:space-between}
.variant-B .global-note{margin-top:24px}
.blank{padding:20px;font-size:12px;color:var(--muted)}
dialog{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:0;width:min(800px,92vw);max-height:88dvh;box-shadow:0 24px 100px #0004}
dialog::backdrop{background:#0007;backdrop-filter:blur(2px)}
.dialog-head{padding:20px 24px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.dialog-head h2{font-size:20px}
.dialog-head p{font-size:12px;color:var(--muted);margin-top:5px}
.dialog-body{padding:20px 24px;max-height:61dvh;overflow:auto}
.dialog-footer{padding:15px 24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.dialog-footer button{font-size:12px}
.export-metrics{display:flex;gap:20px;font-size:12px;margin-bottom:16px}
.export-metrics b{font-size:22px;margin-right:5px}
.export-row{padding:13px 0;border-top:1px solid var(--line);font-size:12px}
.export-row strong{display:block;font-size:13px;margin-bottom:4px}
.export-row pre{font:inherit;line-height:1.9;white-space:pre-wrap;margin:4px 0 0}
.export-warn{padding:12px;background:var(--surface);border:1px dashed var(--accent);border-radius:8px;font-size:12px;margin-bottom:14px}
.decision-row{font-size:12px;display:flex;align-items:center;gap:12px;margin:14px 0}
.decision-row select{font-size:12px}
.advanced summary{font-size:11px;color:var(--muted);cursor:pointer}
.advanced button{margin-top:10px}
.export-json{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;background:var(--surface);font:10px/1.8 Consolas,monospace;padding:12px;margin-top:10px;border-radius:8px}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);padding:10px 18px;background:var(--ink);color:var(--panel);border-radius:9px;z-index:200;font-size:12px;box-shadow:0 8px 25px #0002;max-width:90vw}
.toast[hidden]{display:none}
.screenreader{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
body.print-record .layout{display:none}
@media(min-width:1600px){.variant-B .layout{grid-template-columns:260px minmax(0,1fr) 330px}
.point-overview{padding:22px 26px}
.point-body{padding:22px 26px}
}
@media(max-width:1150px){.layout{grid-template-columns:215px minmax(0,1fr);padding:16px;gap:15px}
.variant-B .layout{grid-template-columns:205px minmax(0,1fr) 260px;gap:12px}
.topbar{padding:16px 20px}
h1{font-size:19px}
.plan-grid{grid-template-columns:1fr}
}
@media(max-width:900px){.variant-B .layout{grid-template-columns:205px minmax(0,1fr)}
.variant-B .review-pane{grid-column:2;position:static;margin-top:0}
.variant-B .review-editor{min-height:130px}
.topbar{align-items:flex-start}
.top-actions{justify-content:flex-end}
.top-actions button{font-size:11px;padding:6px 9px}
.page-summary{padding:10px 20px}
.metrics{gap:12px}
.metrics .divided{padding-left:12px}
.metrics b{font-size:17px}
}
@media(max-width:700px){.topbar{display:block;padding:16px}
.top-actions{margin-top:14px;justify-content:flex-start}
.page-summary{display:block;padding:10px 16px}
.page-summary .phase{margin-top:6px}
.layout,.variant-B .layout{display:block;padding:12px}
.sidebar{position:static;max-height:290px;margin-bottom:15px}
.variant-B .review-pane{margin-top:15px}
.plan-grid,.batch-card{margin-bottom:14px}
.point-overview,.point-body{padding:17px}
.point-controls{flex-wrap:wrap}
.breadcrumbs{font-size:10px}
.scene-banner h2{font-size:17px}
.dialog-body{padding:16px}
.dialog-head{padding:16px}
}
@media print{.top-actions,.sidebar,.review-pane,.page-summary,.point-controls,.toast,.footer-note{display:none!important}
.layout,.variant-B .layout{display:block;padding:0}
.topbar{padding:0 0 14px;background:none}
.point-card{break-inside:avoid;box-shadow:none}
.batch-card{margin-bottom:15px}
body{background:#fff;color:#222}
}


[hidden]{display:none!important}

.view-nav{position:sticky;top:0;z-index:45;min-height:51px;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:0 26px;background:var(--header);border-bottom:1px solid var(--line)}
.view-tabs{display:flex;align-self:stretch;gap:20px}
.view-tab{border:0;border-radius:0;background:none;padding:13px 3px 10px;color:var(--muted);font-size:13px;border-bottom:3px solid transparent}
.view-tab[aria-current=page]{color:var(--ink);border-bottom-color:var(--accent);font-weight:700}
.view-tab:hover{background:none;border-bottom-color:var(--accent)}
.view-tab .tab-count{font-size:10px;font-weight:400;border:1px solid var(--line);border-radius:15px;padding:1px 6px;margin-left:5px}
.view-location{display:flex;align-items:center;gap:14px;min-width:0;color:var(--muted);font-size:11px}
.view-location button{padding:5px 9px;font-size:11px}
.overview-view{max-width:1540px;margin:0 auto;padding:26px 30px 30px}
.overview-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}
.overview-heading h2{font-size:25px;margin:4px 0 6px}
.overview-heading p{font-size:12px;color:var(--muted);line-height:1.9}
.overview-heading .eyebrow{font-size:10px}
.overview-actions{display:flex;gap:8px;flex-shrink:0}
.overview-actions button{font-size:12px}
.overview-toolbar{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;margin-bottom:14px;position:sticky;top:var(--case-nav-height,51px);z-index:35;min-height:62px}
.overview-search{flex:1;min-width:190px;max-width:420px;font-size:12px}
.overview-filter{font-size:12px;min-width:136px}
.overview-toolbar button{font-size:12px}
.overview-result{margin-left:auto;font-size:11px;color:var(--muted);white-space:nowrap}
.overview-table{background:var(--panel);border:1px solid var(--line);border-radius:11px}
.overview-list-head,.ov-scene-toggle{display:grid;grid-template-columns:22px minmax(220px,1fr) 72px 154px 108px;gap:12px;align-items:center}
.overview-list-head{padding:11px 18px;font-size:10px;color:var(--muted);background:var(--header);border-bottom:1px solid var(--line);border-radius:10px 10px 0 0;position:sticky;top:calc(var(--case-nav-height,51px) + var(--case-filter-height,62px) + 14px);z-index:25}
.overview-list-head span:nth-child(n+3){text-align:left}
.ov-scene{border-bottom:1px solid var(--line)}
.ov-scene:last-child{border-bottom:0}
.ov-scene-toggle{width:100%;border:0;border-radius:0;background:none;min-height:67px;padding:13px 18px;text-align:left}
.ov-scene-toggle:hover{background:var(--surface);border:0}
.ov-scene-toggle[aria-expanded=true]{background:var(--header)}
.ov-scene:last-child>.ov-scene-toggle[aria-expanded=false]{border-radius:0 0 10px 10px}
.ov-chevron{color:var(--muted);font-size:17px;transition:transform .15s;display:inline-block;text-align:center}
.ov-scene-toggle[aria-expanded=true] .ov-chevron{transform:rotate(90deg)}
.ov-scene-id{display:block;min-width:0;white-space:normal;overflow-wrap:anywhere;font-family:Consolas,monospace;color:var(--accent);font-size:11px;font-weight:400;margin-top:4px}.ov-scene-title{min-width:0;overflow-wrap:anywhere}
.ov-scene-title{font-size:13px;font-weight:650;line-height:1.7}
.ov-scene-sub{display:block;margin-top:3px;font-size:10px;font-weight:400;color:var(--muted)}
.ov-count{font-size:12px;color:var(--ink)}
.ov-count b{font-size:16px;font-weight:650;margin-right:4px}
.ov-plan{font-size:11px;color:var(--muted);line-height:1.7}
.ov-plan .need{display:block;color:var(--accent);font-size:10px}
.ov-opinion{font-size:11px;color:var(--muted)}
.ov-opinion.has-note{color:var(--accent);font-weight:600}
.ov-note-count{display:inline-grid;place-items:center;min-width:22px;height:22px;border-radius:50%;background:var(--surface);border:1px solid var(--line);font-size:11px;margin-right:5px}
.ov-cases{padding:5px 14px 12px 19px;margin:0 0 0 40px;border-left:2px solid var(--line);background:var(--surface)}
.ov-child-head{display:grid;grid-template-columns:115px minmax(170px,1fr) 126px 88px 88px;gap:12px;padding:8px 12px;font-size:10px;color:var(--muted)}
.ov-point{display:grid;grid-template-columns:115px minmax(170px,1fr) 126px 88px 88px;gap:12px;align-items:center;width:100%;border:1px solid transparent;border-radius:8px;padding:12px;margin:2px 0;background:var(--panel);text-align:left;min-height:75px}
.ov-point:hover{border-color:var(--accent);background:var(--header)}
.ov-point-id{font:10px/1.7 Consolas,monospace;color:var(--muted)}
.ov-point-title{display:block;font-size:12px;line-height:1.7;font-weight:650}
.ov-point-expected{display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:10px;color:var(--muted);margin-top:4px;line-height:1.7}
.ov-point-copy{min-width:0}
.ov-point-state{display:flex;flex-wrap:wrap;gap:4px}
.ov-point-state .badge{font-size:9px;padding:1px 6px}
.ov-point .ov-opinion{font-size:10px}
.ov-point-open{color:var(--accent);font-size:11px;white-space:nowrap}
.overview-empty{padding:35px;text-align:center;color:var(--muted);font-size:13px}
.overview-footer{display:flex;justify-content:space-between;gap:18px;margin-top:15px;color:var(--muted);font-size:10px;line-height:1.9}
.overview-footer a{color:var(--accent)}
.overview-view mark{background:var(--surface);color:var(--ink);border-bottom:1px solid var(--accent);padding:0 1px}
.variant-B .layout{padding-top:20px}
.view-nav [hidden]{display:none!important}
.overview-view [hidden]{display:none!important}
body[data-view=overview] .page-summary .phase{font-size:11px}
@media(min-width:1600px){.overview-view{padding-top:30px}
.overview-list-head,.ov-scene-toggle{grid-template-columns:24px minmax(300px,1fr) 90px 175px 130px}
.ov-scene-toggle{min-height:72px}
.ov-scene-title{font-size:14px}
.ov-child-head,.ov-point{grid-template-columns:140px minmax(260px,1fr) 155px 105px 100px}
}
@media(max-width:1050px){.overview-view{padding:22px 20px}
.overview-list-head,.ov-scene-toggle{grid-template-columns:18px minmax(180px,1fr) 60px 130px 87px;gap:8px;padding-left:14px;padding-right:14px}
.ov-child-head,.ov-point{grid-template-columns:93px minmax(150px,1fr) 113px 77px 76px;gap:8px}
.ov-point-id{font-size:9px}
.ov-point-open{font-size:10px}
.ov-cases{margin-left:33px;padding-left:10px}
.overview-heading h2{font-size:23px}
.overview-search{max-width:330px}
}
@media(max-width:760px){.view-nav{padding:0 16px;gap:10px}
.view-tabs{gap:15px}
.view-location>span{display:none}
.overview-view{padding:18px 12px}
.overview-heading{display:block}
.overview-heading h2{font-size:23px}
.overview-actions{margin-top:12px}
.overview-toolbar{position:static;flex-wrap:wrap;padding:10px}
.overview-search{max-width:none;flex-basis:100%;min-width:0}
.overview-result{font-size:10px}
.overview-list-head{display:none}
.ov-scene-toggle{grid-template-columns:16px minmax(0,1fr) 45px;gap:7px;padding:12px;min-height:66px}
.ov-scene-toggle>.ov-plan,.ov-scene-toggle>.ov-opinion{display:none}
.ov-scene-title{font-size:12px}
.ov-child-head{display:none}
.ov-cases{margin-left:25px;padding:5px 7px 8px 9px}
.ov-point{grid-template-columns:1fr auto;gap:5px 8px;padding:11px}
.ov-point-id{grid-column:1;font-size:10px}
.ov-point-copy{grid-column:1/3;grid-row:2}
.ov-point-state{grid-column:1;grid-row:3}
.ov-point>.ov-opinion{display:none}
.ov-point-open{grid-column:2;grid-row:3}
.overview-footer{display:block}
.view-location button{font-size:10px}
.overview-toolbar>.overview-result{margin-left:0}
}
@media print{.view-nav,.overview-toolbar,.overview-actions,.overview-footer{display:none!important}
.overview-view{max-width:none;padding:0}
.overview-list-head{position:static}
.ov-scene-toggle{break-after:avoid}
.ov-point{break-inside:avoid}
.overview-table{border:1px solid var(--line)}
}

.overview-view{--overview-row-height:60px}
body[data-view=overview] .topbar{padding-top:13px;padding-bottom:13px}
body[data-view=overview] .topbar .subtitle{display:none}
body[data-view=overview] .page-summary{display:none}
body[data-view=overview] .overview-view{padding-top:19px}
body[data-view=overview] .overview-heading{margin-bottom:14px}
body[data-view=overview] .overview-heading .eyebrow{display:none}
body[data-view=overview] .overview-heading h2{font-size:22px;margin-top:0;margin-bottom:3px}
body[data-view=overview] .overview-toolbar{padding-top:8px;padding-bottom:8px;min-height:54px}
body[data-view=overview] .overview-list-head{top:calc(var(--case-nav-height,51px) + var(--case-filter-height,54px) + 14px)}
body[data-view=overview] .ov-scene-toggle{min-height:var(--overview-row-height);padding-top:10px;padding-bottom:10px}


.save-status{font-size:11px;line-height:1.8;color:var(--muted);margin:10px 0;overflow-wrap:anywhere}
.saved-links{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:10px}
.offline-save-note{padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:8px;font-size:12px;line-height:1.8}
.sources-list{font-size:12px;line-height:1.9}
.sources-list article{padding:12px 0;border-top:1px solid var(--line)}
.variant-B .review-pane{max-height:calc(100dvh - 32px);overflow:auto}

`;
