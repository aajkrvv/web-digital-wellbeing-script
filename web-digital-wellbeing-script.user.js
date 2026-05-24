// ==UserScript==
// @name         Web Digital Wellbeing Script
// @namespace    aajkrvv
// @version      1.1.1
// @description  1
// @author       aajkrvv
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @homepageURL  https://github.com/aajkrvv/web-digital-wellbeing-script
// @supportURL   https://github.com/aajkrvv/web-digital-wellbeing-script
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==
(function () {
    'use strict';

    /* ─────────── 상수! ─────────── */
    const KEY_PREFIX   = 'wbt_d_';
    const MAX_DAYS     = 14;
    const VIEWER_URL   = 'https://aajkrvv.github.io/web-digital-wellbeing-script/';
    const COMMIT_EVERY = 5000;
    const MAX_TICK_SEC = 30;

    /* ─────────── 유틸 ─────────── */
    function getLocalDate(off=0){
        const d=new Date();d.setDate(d.getDate()-off);
        return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    }
    function getDomain(){ return location.hostname.replace(/^www\./,'')||'unknown'; }
    function readSec(date,dom){ return parseInt(GM_getValue(KEY_PREFIX+date+'_'+dom,'0'),10)||0; }
    function writeSec(date,dom,s){ GM_setValue(KEY_PREFIX+date+'_'+dom,String(s)); }
    function loadAll(){
        const r={};
        try{ GM_listValues().forEach(k=>{
            if(!k.startsWith(KEY_PREFIX))return;
            const rest=k.slice(KEY_PREFIX.length),date=rest.slice(0,10),dom=rest.slice(11);
            if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!dom)return;
            if(!r[date])r[date]={};
            r[date][dom]=parseInt(GM_getValue(k,'0'),10)||0;
        });}catch(e){}
        return r;
    }
    function cleanup(){
        try{
            const c=getLocalDate(MAX_DAYS);
            GM_listValues().forEach(k=>{
                if(k.startsWith(KEY_PREFIX)&&k.slice(KEY_PREFIX.length,KEY_PREFIX.length+10)<c)GM_deleteValue(k);
            });
        }catch(e){}
    }
    function genId(){ return Math.random().toString(36).slice(2,10); }
    function fmt(s){
        if(!s||s<1)return '0초';
        if(s<60)return `${s}초`;
        if(s<3600){const m=Math.floor(s/60),r=s%60;return r?`${m}분 ${r}초`:`${m}분`;}
        const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
        return m?`${h}시간 ${m}분`:`${h}시간`;
    }
    function fmtS(s){
        if(!s||s<1)return '-';
        if(s<60)return `${s}s`;
        if(s<3600)return `${Math.floor(s/60)}m`;
        const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
        return m?`${h}h ${m}m`:`${h}h`;
    }
    function fmtRemain(sec){
        if(sec<=0)return '0초 남음';
        if(sec<60)return `${sec}초 남음`;
        const m=Math.floor(sec/60);
        if(m<60)return `${m}분 남음`;
        const h=Math.floor(m/60);
        return m%60?`${h}시간 ${m%60}분 남음`:`${h}시간 남음`;
    }

    /* ─────────── 큐 ─────────── */
    let _busy=false;const _q=[];
    function enqueue(fn){
        if(_busy)return new Promise(r=>_q.push({fn,r}));
        _busy=true;let res;
        try{res=fn();}finally{
            _busy=false;
            if(_q.length){const nx=_q.shift();Promise.resolve().then(()=>enqueue(nx.fn).then(nx.r));}
        }
        return Promise.resolve(res);
    }

    /* ═══════════════════════════════════════════════
       규칙·그룹  (GM storage)
       규칙: {id,domain,groupId,delaySec,freeMins,limitMins,days,notify:{min1,min5,min10}}
       그룹: {id,name,limitMins}
    ═══════════════════════════════════════════════ */
    function getRules(){
        try{return JSON.parse(GM_getValue('wbt_rules','[]'));}catch{return [];}
    }
    function saveRules(r){GM_setValue('wbt_rules',JSON.stringify(r));}
    function getGroups(){
        try{return JSON.parse(GM_getValue('wbt_groups','[]'));}catch{return [];}
    }
    function saveGroups(g){GM_setValue('wbt_groups',JSON.stringify(g));}

    /* www.naver.com == naver.com, cafe.naver.com != naver.com */
    function stripWWW(d){return d.replace(/^www\./,'');}
    function domainMatches(current,ruleDomain){
        return stripWWW(current)===stripWWW(ruleDomain);
    }

    function findRule(domain){
        const today=new Date().getDay();
        return getRules().find(r=>{
            if(!domainMatches(domain,r.domain))return false;
            if(r.days&&r.days.length>0&&!r.days.includes(today))return false;
            return true;
        })||null;
    }

    function getGroupUsage(groupId){
        const td=getLocalDate();
        return getRules().filter(r=>r.groupId===groupId).reduce((s,r)=>s+readSec(td,r.domain),0);
    }

    /* ═══════════════════════════════════════════════
       오버레이 (트래커 측)
    ═══════════════════════════════════════════════ */
    const OV_CSS=`
    #wbt-ov{position:fixed;inset:0;z-index:2147483647;background:#F8F9FA;color:#202124;
      font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
      display:flex;flex-direction:column;align-items:center;padding:12vh 24px 5vh;
      box-sizing:border-box;user-select:none;-webkit-user-select:none}
    .wbt-ob{flex:1;display:flex;flex-direction:column;align-items:center;
            justify-content:center;text-align:center}
    #wbt-ot{font-size:28px;font-weight:500;line-height:1.4;margin-bottom:20px}
    #wbt-on{font-size:52px;font-weight:700;color:#4C80F1;margin-bottom:8px}
    #wbt-od{font-size:15px;color:#5F6368;line-height:1.7;max-width:300px;margin-top:8px}
    .wbt-bw{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:60px}
    .wbt-b{width:100%;max-width:260px;height:52px;background:#E8E8E8;color:#000;border:none;
      border-radius:26px;font-size:15px;font-weight:700;cursor:pointer;
      -webkit-tap-highlight-color:transparent;transition:transform .08s,opacity .08s}
    .wbt-b.off{opacity:.4;cursor:not-allowed}
    .wbt-b:active:not(.off){transform:scale(0.93);opacity:.65}
    `;

    let _toastTimer=null;
    function showNotifToast(msg){
        let el=document.getElementById('wbt-toast');
        if(!el){
            const s=document.createElement('style');
            s.textContent=`#wbt-toast{position:fixed;top:-60px;left:50%;transform:translateX(-50%);
                background:rgba(20,20,20,.88);color:#fff;padding:9px 18px;border-radius:20px;
                font-size:13px;z-index:2147483646;transition:top .3s cubic-bezier(.34,1.56,.64,1);
                white-space:nowrap;pointer-events:none;
                font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}`;
            document.head.appendChild(s);
            el=document.createElement('div');el.id='wbt-toast';
            document.body.appendChild(el);
        }
        el.textContent=msg;
        el.style.top='16px';
        clearTimeout(_toastTimer);
        _toastTimer=setTimeout(()=>{el.style.top='-60px';},3500);
    }

    function _injectOvStyle(){
        if(document.getElementById('wbt-ov-st'))return;
        const s=document.createElement('style');s.id='wbt-ov-st';s.textContent=OV_CSS;
        (document.head||document.documentElement).appendChild(s);
    }

    function showLockScreen(domain,rule,isGroup){
        if(document.getElementById('wbt-ov'))return;
        _injectOvStyle();
        const el=document.createElement('div');el.id='wbt-ov';
        const descGroup=isGroup?'그룹 사용 시간 제한에 도달했습니다.':'오늘의 사용 시간 제한에 도달했습니다.';
        el.innerHTML=`
            <div class="wbt-ob">
                <div id="wbt-ot">오늘은 여기까지!</div>
                <div id="wbt-od">${descGroup}<br>내일 다시 사용할 수 있습니다.</div>
            </div>
            <div class="wbt-bw">
                <button class="wbt-b" id="wbt-close">닫기</button>
            </div>`;
        (document.body||document.documentElement).appendChild(el);
        document.getElementById('wbt-close').addEventListener('click',()=>{
            /* 닫기: 차단된 사이트가 아닌 곳으로 이동 */
            el.remove();
            document.getElementById('wbt-ov-st')?.remove();
            history.back();
        });
    }

    function showDelayScreen(domain,rule,onPass){
        if(document.getElementById('wbt-ov'))return;
        _injectOvStyle();
        const freeLbl=rule.freeMins>0?`${rule.freeMins}분동안 잠금 해제`:'잠금 해제';
        /* 시스템 시간 기반 카운트다운 (드리프트 방지) */
        let _targetTime=Date.now()+rule.delaySec*1000;
        let _raf=null;
        const el=document.createElement('div');el.id='wbt-ov';
        el.innerHTML=`
            <div class="wbt-ob">
                <div id="wbt-ot">숨을 크게 들이 마시고<br>길게 내쉬어 봅시다</div>
                <div id="wbt-on">${rule.delaySec}</div>
            </div>
            <div class="wbt-bw">
                <button class="wbt-b off" id="wbt-open">${freeLbl}</button>
                <button class="wbt-b" id="wbt-close">닫기</button>
            </div>`;
        (document.body||document.documentElement).appendChild(el);
        const numEl=document.getElementById('wbt-on');
        const openBtn=document.getElementById('wbt-open');
        const closeBtn=document.getElementById('wbt-close');

        function resetCountdown(){
            _targetTime=Date.now()+rule.delaySec*1000;
            numEl.style.display='';
            numEl.textContent=rule.delaySec;
            openBtn.classList.add('off');
        }
        function unlock(){
            clearTimeout(_raf);
            numEl.style.display='none';
            openBtn.classList.remove('off');
        }
        function tick(){
            const rem=Math.max(0,Math.ceil((_targetTime-Date.now())/1000));
            if(rem<=0){unlock();return;}
            numEl.textContent=rem;
            _raf=setTimeout(tick,100); /* 100ms마다 시스템 시간 확인 → 정확도 보장 */
        }
        tick();

        /* 탭 전환 시 카운트다운 리셋 */
        const onBlur=()=>{ clearTimeout(_raf);_raf=null;resetCountdown(); };
        const onFocus=()=>{ if(openBtn.classList.contains('off')){resetCountdown();tick();} };
        const onPageShow=(e)=>{ if(openBtn.classList.contains('off')){resetCountdown();tick();} };
        window.addEventListener('blur',onBlur);
        window.addEventListener('focus',onFocus);
        window.addEventListener('pageshow',onPageShow);

        openBtn.addEventListener('click',()=>{
            if(openBtn.classList.contains('off'))return;
            clearTimeout(_raf);
            window.removeEventListener('blur',onBlur);
            window.removeEventListener('focus',onFocus);
            window.removeEventListener('pageshow',onPageShow);
            el.remove();
            document.getElementById('wbt-ov-st')?.remove();
            onPass?.();
        });
        closeBtn.addEventListener('click',()=>{
            clearTimeout(_raf);
            window.removeEventListener('blur',onBlur);
            window.removeEventListener('focus',onFocus);
            window.removeEventListener('pageshow',onPageShow);
            el.remove();
            document.getElementById('wbt-ov-st')?.remove();
            history.back();
        });
    }

    function initLockMonitor(domain,rule){
        const hasIndivLim=rule.limitMins>0;
        const grp=rule.groupId?getGroups().find(g=>g.id===rule.groupId):null;
        const hasGrpLim=grp&&grp.limitMins>0;
        if(!hasIndivLim&&!hasGrpLim)return;
        setInterval(()=>{
            if(document.getElementById('wbt-ov'))return;
            if(hasIndivLim&&readSec(getLocalDate(),domain)>=rule.limitMins*60){
                showLockScreen(domain,rule,false);return;
            }
            if(hasGrpLim&&getGroupUsage(rule.groupId)>=grp.limitMins*60){
                showLockScreen(domain,rule,true);
            }
        },10000);
    }

    /* 알림 체크에 쓰이는 이미 표시된 임계값 추적 */
    const _notifShown={};

    function checkNotifs(domain,rule,usedSec){
        if(!rule.notify||!rule.limitMins)return;
        const limSec=rule.limitMins*60;
        const remSec=limSec-usedSec;
        [[1,'min1','1분'],[5,'min5','5분'],[10,'min10','10분']].forEach(([mins,key,label])=>{
            if(!rule.notify[key])return;
            const k=`${domain}_${mins}_${getLocalDate()}`;
            if(_notifShown[k])return;
            const th=mins*60;
            if(remSec>0&&remSec<=th+COMMIT_EVERY/1000+1){
                _notifShown[k]=1;
                showNotifToast(`${domain} — ${label} 후 차단됩니다`);
            }
        });
    }

    function checkAndShowOverlay(){
        if(location.href.startsWith(VIEWER_URL))return;
        const domain=getDomain();
        const rule=findRule(domain);
        if(!rule)return;

        /* 1. 제한 초과 여부 (개인·그룹 포함) — 우선순위 최고 */
        let isLocked=false;
        if(rule.limitMins>0&&readSec(getLocalDate(),domain)>=rule.limitMins*60)isLocked=true;
        if(!isLocked&&rule.groupId){
            const grp=getGroups().find(g=>g.id===rule.groupId);
            if(grp?.limitMins>0&&getGroupUsage(rule.groupId)>=grp.limitMins*60)isLocked=true;
        }
        if(isLocked){
            if(!document.getElementById('wbt-ov'))showLockScreen(domain,rule,!!rule.groupId);
            return;
        }

        /* 2. 대기 화면 */
        if(rule.delaySec>0){
            const fk='wbt_free_'+domain;
            const gk=rule.groupId?'wbt_free_grp_'+rule.groupId:null;
            const fe=sessionStorage.getItem(fk);
            const ge=gk?sessionStorage.getItem(gk):null;
            const inFree=(fe&&Date.now()<+fe)||(ge&&Date.now()<+ge);
            if(inFree){initLockMonitor(domain,rule);return;}
            sessionStorage.removeItem(fk);
            if(gk)sessionStorage.removeItem(gk);
            if(!document.getElementById('wbt-ov')){
                showDelayScreen(domain,rule,()=>{
                    const exp=Date.now()+(rule.freeMins>0?rule.freeMins*60000:86400000);
                    sessionStorage.setItem(fk,String(exp));
                    if(gk)sessionStorage.setItem(gk,String(exp));
                    initLockMonitor(domain,rule);
                });
            }
        } else {
            initLockMonitor(domain,rule);
        }
    }

    function initOverlay(){
        /* 여러 경로로 진입 시 지속적으로 체크 */
        const check=()=>setTimeout(checkAndShowOverlay,50);
        if(document.body)check();
        else document.addEventListener('DOMContentLoaded',check);
        window.addEventListener('pageshow',check);               /* BFCache 복원 */
        window.addEventListener('visibilitychange',()=>{if(!document.hidden)check();}); /* 탭 전환 */
        window.addEventListener('popstate',check);               /* SPA 네비게이션 */
    }

    /* ─────────── 트래커 ─────────── */
    function initTracker(){
        const dom=getDomain();let acc=0,lt=Date.now();
        /* 오버레이 표시 중에는 시간 측정 안 함 */
        const active=()=>!document.hidden&&document.hasFocus()&&!document.getElementById('wbt-ov');
        setInterval(()=>{
            const n=Date.now();
            if(active()){const e=Math.min(Math.round((n-lt)/1000),MAX_TICK_SEC);if(e>0)acc+=e;}
            lt=n;
        },1000);
        setInterval(()=>{
            if(acc<1)return;
            const d=acc,td=getLocalDate();acc=0;
            enqueue(()=>{
                writeSec(td,dom,readSec(td,dom)+d);
                /* 알림 체크 */
                const rule=findRule(dom);
                if(rule)checkNotifs(dom,rule,readSec(td,dom));
            });
        },COMMIT_EVERY);
        window.addEventListener('beforeunload',()=>{
            if(acc<1)return;
            const td=getLocalDate();
            writeSec(td,dom,readSec(td,dom)+acc);acc=0;
        });
        if(Math.random()<0.05)cleanup();
    }

    /* ─────────── 뷰어 상태 ─────────── */
    let _D=null,_dd='',_wo=0,_editRuleId=null,_editGroupId=null;

    /* ─────────── 테마 ─────────── */
    const getTheme=()=>GM_getValue('wbt_theme','auto');
    function setTheme(t){GM_setValue('wbt_theme',t);applyTheme();}
    function applyTheme(){document.documentElement.setAttribute('data-theme',getTheme());}

    /* ─────────── 네비게이션 ─────────── */
    function nav(view,p={}){
        if(p.date)_dd=p.date;
        if(p.wo!==undefined)_wo=p.wo;
        if(p.ruleId!==undefined)_editRuleId=p.ruleId;
        if(p.groupId!==undefined)_editGroupId=p.groupId;
        window.scrollTo(0,0);
        const app=document.getElementById('app');
        app.innerHTML=
            view==='main'       ?renderMain()      :
            view==='dash'       ?renderDash()      :
            view==='weekly'     ?renderWeekly()    :
            view==='settings'   ?renderSettings()  :
            view==='rules'      ?renderRules()     :
            view==='rule-form'  ?renderRuleForm()  :
            view==='group-form' ?renderGroupForm() :'';
        attachEv(view);
    }

    /* ─────────── 탭 피드백 ─────────── */
    function initTapFeedback(appEl){
        appEl.addEventListener('pointerdown',e=>{
            const s=e.target.closest('.ico,.dpill,.wk-tab,.day-btn,.tog');
            if(s)s.classList.add('tap-sc');
            const d=e.target.closest('.card-tap,.s-row,.r-item');
            if(d)d.classList.add('tap-dm');
        },{capture:true,passive:true});
        const clr=()=>setTimeout(()=>{
            appEl.querySelectorAll('.tap-sc,.tap-dm').forEach(el=>el.classList.remove('tap-sc','tap-dm'));
        },80);
        ['pointerup','pointercancel','pointerleave'].forEach(ev=>
            appEl.addEventListener(ev,clr,{capture:true,passive:true}));
    }

    /* ─────────── 페이지 셋업 ─────────── */
    function initViewer(){
        _D=loadAll();_dd=getLocalDate();_wo=0;_editRuleId=null;_editGroupId=null;
        document.head.innerHTML=`
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>디지털 웰빙</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        `;
        document.body.innerHTML='<div id="app"></div>';
        document.body.removeAttribute('style');document.body.removeAttribute('class');
        const s=document.createElement('style');s.textContent=CSS;document.head.appendChild(s);
        applyTheme();
        initTapFeedback(document.getElementById('app'));
        nav('main');
    }

    /* ═══════════════ CSS ═══════════════ */
    const CSS=`
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{
        --bg:#EFEFEF;--sf:#FFF;--sf2:#EFEFEF;
        --t1:#1A1A1A;--t2:#8E8E93;--t3:#C7C7CC;
        --pri:#007AFF;--div:rgba(60,60,67,.12);
        --empty:#E5E5EA;--sh:0 1px 3px rgba(0,0,0,.06);
    }
    [data-theme="dark"]{
        --bg:#000;--sf:#1C1C1E;--sf2:#2C2C2E;
        --t1:#FFF;--t2:#AEAEB2;--t3:#48484A;
        --pri:#0A84FF;--div:rgba(255,255,255,.1);
        --empty:#2C2C2E;--sh:none;
    }
    @media(prefers-color-scheme:dark){
        :root:not([data-theme="light"]){
            --bg:#000;--sf:#1C1C1E;--sf2:#2C2C2E;
            --t1:#FFF;--t2:#AEAEB2;--t3:#48484A;
            --pri:#0A84FF;--div:rgba(255,255,255,.1);
            --empty:#2C2C2E;--sh:none;
        }
    }
    html,body{background:var(--bg);min-height:100vh}
    body{font-family:'Noto Sans KR',-apple-system,'Apple SD Gothic Neo',sans-serif;
         color:var(--t1);-webkit-font-smoothing:antialiased}
    #app{max-width:480px;margin:0 auto;padding-bottom:48px}

    .tap-sc{transform:scale(0.84)!important;opacity:.5!important;
            transition:transform .05s,opacity .05s!important}
    .tap-dm{opacity:.6!important;background:var(--sf2)!important;
            transition:opacity .05s,background .05s!important}

    /* 헤더 */
    .hdr{display:flex;align-items:center;padding:18px 16px 10px;gap:4px}
    .hdr-title{font-size:22px;font-weight:700;flex:1;color:var(--t1);line-height:1}
    .ico{width:36px;height:36px;background:none;border:none;color:var(--t2);
         cursor:pointer;border-radius:10px;display:flex;align-items:center;
         justify-content:center;flex-shrink:0;font-family:inherit;
         -webkit-tap-highlight-color:transparent;user-select:none}
    .ico:hover{background:rgba(128,128,128,.1)}
    .ico-back{color:var(--t2);margin-right:2px}

    /* 레이블 */
    .slbl{font-size:13px;font-weight:500;color:var(--t2);padding:14px 20px 6px}
    .slbl-row{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 6px}
    .slbl-txt{font-size:13px;font-weight:500;color:var(--t2)}
    .badge{font-size:13px;color:var(--pri)}

    /* 카드 */
    .card{background:var(--sf);border-radius:18px;margin:0 16px 4px;box-shadow:var(--sh)}
    .card-tap{cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}

    /* 오늘 카드 */
    .today-lbl{font-size:13px;color:var(--t2);padding:16px 18px 0}
    .today-body{display:flex;align-items:center;padding:8px 18px 12px;gap:8px}
    .today-left{flex:1;min-width:0}
    .big{font-size:34px;font-weight:800;letter-spacing:-1.5px;line-height:1.05;color:var(--t1)}
    .today-right{flex-shrink:0}
    .app-rows{padding:0 18px 16px;border-top:.5px solid var(--div);padding-top:12px}
    .app-row{display:flex;align-items:center;gap:8px;margin-bottom:9px}
    .app-row:last-child{margin-bottom:0}
    .a-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .a-name{flex:1;font-size:14px;font-weight:500;color:var(--t1);
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .a-time{font-size:14px;color:var(--t2);white-space:nowrap}

    /* 미니 카드 */
    .mini-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 16px 4px}
    .mc{background:var(--sf);border-radius:14px;padding:13px 11px;box-shadow:var(--sh)}
    .mc-lbl{font-size:11px;font-weight:500;color:var(--t2);margin-bottom:5px}
    .mc-val{font-size:19px;font-weight:800;letter-spacing:-.4px;line-height:1.1;color:var(--t1)}
    .mc-sub{font-size:10px;color:var(--t3);margin-top:2px}

    /* 리스트 행 */
    .lrow{display:flex;align-items:center;padding:12px 18px;gap:12px;
          border-bottom:.5px solid var(--div)}
    .lrow:last-child{border-bottom:none}
    .l-icon{width:32px;height:32px;border-radius:8px;flex-shrink:0;object-fit:cover}
    .l-icon-fb{width:32px;height:32px;border-radius:8px;flex-shrink:0;
               display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700}
    .l-rank{width:22px;text-align:center;font-size:15px;font-weight:700;color:var(--t3);flex-shrink:0}
    .l-name{flex:1;font-size:15px;font-weight:500;color:var(--t1);
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .l-time{font-size:14px;color:var(--t2);white-space:nowrap;flex-shrink:0}
    .empty-msg{padding:28px;text-align:center;font-size:14px;color:var(--t3)}

    /* 날짜 스크롤러 */
    .date-wrap{overflow-x:auto;scrollbar-width:none;background:var(--sf);
               border-radius:18px;margin:0 16px 4px;box-shadow:var(--sh)}
    .date-wrap::-webkit-scrollbar{display:none}
    .date-scr{display:flex;padding:10px 0;gap:4px}
    .dpill{display:flex;flex-direction:column;align-items:center;min-width:42px;
           padding:8px 4px;border-radius:21px;cursor:pointer;flex-shrink:0;
           -webkit-tap-highlight-color:transparent;user-select:none}
    .dpill-dow{font-size:11px;color:var(--t3);margin-bottom:2px;font-weight:500}
    .dpill-num{font-size:19px;font-weight:600;color:var(--t1)}
    .dpill.today .dpill-num{color:var(--pri)}
    .dpill.sel{background:var(--t1)}
    .dpill.sel .dpill-dow,.dpill.sel .dpill-num{color:var(--sf)}

    /* 스택 차트 */
    .schart{display:flex;align-items:flex-end;gap:3px;height:110px;cursor:pointer;user-select:none}
    .scol{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
    .scol:hover .sbar{opacity:.72}
    .sbar{width:100%;border-radius:3px 3px 0 0;overflow:hidden;display:flex;flex-direction:column-reverse}
    .slb{font-size:9px;color:var(--t3);white-space:nowrap;height:16px;line-height:16px}
    .slb.today{color:var(--pri);font-weight:700}
    .slb.sel{color:var(--t1);font-weight:700}
    .scol.sel .sbar{outline:2px solid var(--t1);outline-offset:-1px}
    .s-legend{display:flex;flex-direction:column;gap:6px;padding:8px 0 2px}
    .sl-item{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--t2)}
    .sl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

    /* 주간 리포트 */
    .wk-sub{font-size:13px;color:var(--t2);padding:4px 20px 10px}
    .wk-tabs{display:flex;padding:4px 16px}
    .wk-tab{flex:1;text-align:center;padding:10px 4px;font-size:15px;font-weight:600;
            color:var(--t3);cursor:pointer;border-radius:30px;border:none;
            background:none;font-family:inherit;
            -webkit-tap-highlight-color:transparent;user-select:none}
    .wk-tab.active{background:rgba(128,128,128,.18);color:var(--t1)}
    .wk-chart-outer{position:relative;padding:0 4px}
    .wk-avg-line{position:absolute;left:4px;right:4px;height:1px;
                 background:rgba(0,122,255,.5);pointer-events:none}
    .wk-avg-lbl{position:absolute;right:0;font-size:10px;color:var(--pri);
                font-weight:600;white-space:nowrap;transform:translateY(-14px)}
    .wk-bars{display:flex;align-items:flex-end;gap:4px;height:90px}
    .wk-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
    .wk-bar{width:100%;border-radius:4px 4px 0 0;min-height:3px;overflow:hidden}
    .wk-bar.zero{background:var(--empty)}
    .wk-lbl{font-size:11px;color:var(--t3);height:16px;line-height:16px}
    .wk-lbl.today{color:var(--pri);font-weight:700}
    .wk-legend{display:flex;flex-direction:column;gap:6px;padding:10px 0 6px}
    .wl-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2)}
    .wl-dot{width:9px;height:9px;border-radius:50%}
    .wl-dash{width:16px;height:0;border-top:2px dashed rgba(0,122,255,.6)}

    /* 설정 */
    .setting-section{font-size:12px;color:var(--t2);padding:14px 20px 6px;font-weight:500}
    .s-row{display:flex;align-items:center;justify-content:space-between;
           padding:14px 18px;border-bottom:.5px solid var(--div);cursor:pointer;
           -webkit-tap-highlight-color:transparent;user-select:none}
    .s-row:last-child{border-bottom:none}
    .s-lbl{font-size:16px;font-weight:500;color:var(--t1)}
    .s-sub{font-size:13px;color:var(--t2);margin-top:3px}
    .s-chk{font-size:16px;color:var(--pri);width:20px;text-align:center;flex-shrink:0}
    .s-arr{font-size:16px;color:var(--t3);line-height:1}
    .raw-pre{background:var(--sf);border-radius:12px;margin:4px 16px;padding:14px;
             font-family:'Courier New',monospace;font-size:10px;color:var(--t2);
             white-space:pre-wrap;word-break:break-all;max-height:260px;
             overflow-y:auto;line-height:1.6;display:none}

    /* 규칙 목록 (Samsung 스타일) */
    .rules-desc{font-size:13px;color:var(--t2);padding:8px 20px 12px;line-height:1.6}
    .r-item{padding:14px 18px;border-bottom:.5px solid var(--div)}
    .r-item:last-child{border-bottom:none}
    .r-item-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
    .r-item-name{font-size:15px;font-weight:600;color:var(--t1);
                 display:flex;align-items:center;gap:8px}
    .r-item-favicon{width:20px;height:20px;border-radius:4px}
    .r-item-badge{min-width:22px;height:22px;padding:0 6px;border-radius:11px;
                  background:var(--sf2);display:flex;align-items:center;justify-content:center;
                  font-size:12px;font-weight:600;color:var(--t2)}
    .r-item-status{font-size:14px;font-weight:700;color:var(--t1);margin-bottom:6px}
    .r-item-status.over{color:#EA4335}
    .r-item-status.off{color:var(--t3);font-weight:500}
    .r-bar-bg{height:4px;background:var(--empty);border-radius:2px}
    .r-bar-fill{height:100%;border-radius:2px}
    .r-grp-tag{font-size:11px;color:var(--pri);margin-top:4px}
    .r-days-tag{font-size:11px;color:var(--t3);margin-top:3px}
    .edit-btn{font-size:12px;color:var(--pri);background:none;border:none;cursor:pointer;
              font-family:inherit;padding:2px 0;-webkit-tap-highlight-color:transparent}

    /* 그룹 섹션 */
    .grp-item{padding:12px 18px;border-bottom:.5px solid var(--div)}
    .grp-item:last-child{border-bottom:none}
    .grp-item-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px}
    .grp-item-name{font-size:15px;font-weight:600;color:var(--t1)}
    .grp-members{font-size:12px;color:var(--t2);margin-bottom:5px}
    .grp-status{font-size:13px;font-weight:700;color:var(--t1)}
    .grp-status.over{color:#EA4335}

    /* 규칙 폼 */
    .form-card{background:var(--sf);border-radius:18px;margin:0 16px 4px;
               padding:18px;box-shadow:var(--sh)}
    .form-lbl{font-size:12px;color:var(--t2);margin-bottom:6px;font-weight:500}
    .form-input{width:100%;padding:10px 12px;border:1.5px solid var(--div);
                border-radius:10px;background:var(--sf2);color:var(--t1);
                font-size:15px;font-family:inherit;outline:none;
                -webkit-appearance:none;appearance:none}
    .form-input:focus{border-color:var(--pri)}
    .num-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .num-cell{text-align:center}
    .num-cell .form-lbl{text-align:center}
    .num-input{width:100%;padding:8px 6px;border:1.5px solid var(--div);
               border-radius:8px;background:var(--sf2);color:var(--t1);
               font-size:14px;font-family:inherit;outline:none;text-align:center;
               -webkit-appearance:none;appearance:none}
    .num-input:focus{border-color:var(--pri)}
    .form-sep{height:.5px;background:var(--div);margin:14px 0}
    /* 요일 버튼 */
    .day-row{display:flex;gap:8px;padding:2px 0;flex-wrap:wrap}
    .day-btn{width:36px;height:36px;border-radius:50%;border:1.5px solid var(--div);
             background:none;font-size:13px;font-weight:600;color:var(--t2);
             cursor:pointer;display:flex;align-items:center;justify-content:center;
             font-family:inherit;flex-shrink:0;-webkit-tap-highlight-color:transparent}
    .day-btn.on{background:var(--pri);border-color:var(--pri);color:#fff}
    /* 토글 스위치 */
    .tog-row{display:flex;align-items:center;justify-content:space-between;
             padding:10px 0;border-bottom:.5px solid var(--div)}
    .tog-row:last-child{border-bottom:none}
    .tog-lbl{font-size:15px;color:var(--t1)}
    .tog{width:44px;height:26px;border-radius:13px;background:var(--empty);
         cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;
         -webkit-tap-highlight-color:transparent;border:none}
    .tog.on{background:var(--pri)}
    .tog::after{content:'';position:absolute;width:22px;height:22px;border-radius:50%;
                background:white;top:2px;left:2px;transition:transform .2s;
                box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .tog.on::after{transform:translateX(18px)}
    /* 그룹 셀렉트 */
    .form-select{width:100%;padding:10px 12px;border:1.5px solid var(--div);
                 border-radius:10px;background:var(--sf2);color:var(--t1);
                 font-size:15px;font-family:inherit;outline:none;
                 -webkit-appearance:none;appearance:none;
                 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%238E8E93' stroke-width='1.5'%3E%3Cpath d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
                 background-repeat:no-repeat;background-position:right 12px center;
                 padding-right:36px}
    /* 저장 버튼 */
    .save-btn{width:100%;padding:14px;background:var(--pri);color:#fff;border:none;
              border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;
              font-family:inherit;-webkit-tap-highlight-color:transparent;margin-top:4px}
    .save-btn:active{opacity:.8}
    .hint{font-size:11px;color:var(--t3);line-height:1.7;padding:8px 0 0}

    /* 메인 타이머 목록 */
    .t-row{padding:13px 18px;border-bottom:.5px solid var(--div)}
    .t-row:last-child{border-bottom:none}
    .t-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
    .t-domain{font-size:14px;font-weight:600;color:var(--t1)}
    .t-stat{font-size:11px;color:var(--t2)}
    .t-stat.over{color:#EA4335;font-weight:600}
    .t-bar-bg{height:3px;background:var(--empty);border-radius:2px;margin-bottom:3px}
    .t-bar-fill{height:100%;border-radius:2px}
    .t-cfg{font-size:10px;color:var(--t3)}

    @media(max-width:360px){.big{font-size:28px}.mc-val{font-size:15px}}
    `;

    /* ─────────── 헬퍼 ─────────── */
    const PAL=['#4285F4','#00BCD4','#34A853','#FF6D00','#9C27B0',
               '#00ACC1','#F4511E','#0B8043','#3F51B5','#8E24AA'];
    const DOW_KOR=['일','월','화','수','목','금','토'];

    const ICO={
        back:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M10 3L5 8L10 13"/></svg>`,
        refresh:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                   stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M14 8a6 6 0 1 1-1.6-4.1"/><polyline points="14 2 14 6 10 6"/></svg>`,
        weekly:`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="0" y="9" width="4" height="7" rx="1"/>
                <rect x="6" y="5" width="4" height="11" rx="1"/>
                <rect x="12" y="0" width="4" height="16" rx="1"/></svg>`,
        settings:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <circle cx="6" cy="5" r="2"/>
                  <path d="M2 5h2m4 0h6m-12 6h6m4 0h2"/>
                  <circle cx="10" cy="11" r="2"/></svg>`,
        add:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round">
             <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>`,
        trash:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="2 4 14 4"/>
               <path d="M5 4V3h6v1m1 0v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4"/>
               <line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg>`,
    };

    function iconLI(domain,idx){
        const c=PAL[idx%PAL.length],i=domain.replace(/\..+$/,'').charAt(0).toUpperCase();
        return `<img class="l-icon"
                     src="https://www.google.com/s2/favicons?domain=${domain}&sz=64"
                     loading="lazy" alt=""
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="l-icon-fb" style="display:none;background:${c}22;color:${c}">${i}</div>`;
    }

    function donut(segs){
        const r=36,cx=50,cy=50,C=2*Math.PI*r;
        const total=segs.reduce((s,x)=>s+(x.v||0),0);
        if(!total)return `<svg width="90" height="90" viewBox="0 0 100 100">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--empty)" stroke-width="13"/></svg>`;
        let off=0;
        const cs=segs.filter(x=>x.v>0).map(x=>{
            const len=(x.v/total)*C;
            const el=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${x.c}"
                        stroke-width="13" stroke-linecap="butt"
                        stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}"
                        stroke-dashoffset="${(-off).toFixed(2)}"
                        transform="rotate(-90 ${cx} ${cy})"/>`;
            off+=len;return el;
        });
        return `<svg width="90" height="90" viewBox="0 0 100 100">${cs.join('')}</svg>`;
    }

    function renderTimerList(D,td){
        const rules=getRules();const groups=getGroups();
        if(!rules.length&&!groups.length){
            return `<div style="padding:22px 18px;text-align:center;color:var(--t3);font-size:14px;line-height:1.7">
                설정된 타이머가 없습니다<br>
                <span style="font-size:12px">'관리'를 눌러 사이트를 추가하세요</span>
            </div>`;
        }
        const todayDow=new Date().getDay();
        return rules.map(r=>{
            const activeToday=!r.days||r.days.length===0||r.days.includes(todayDow);
            const used=(D[td]||{})[r.domain]||0;
            const lim=r.limitMins||0;
            const pct=lim>0?Math.min(Math.round(used/(lim*60)*100),100):0;
            const rem=lim>0?Math.max(lim*60-used,0):-1;
            const over=lim>0&&used>=lim*60;
            const bc=over?'#EA4335':pct>75?'#FF9500':'var(--pri)';
            const cfg=[];
            if(r.delaySec>0)cfg.push(`${r.delaySec}초 대기`);
            if(r.freeMins>0)cfg.push(`${r.freeMins}분 자유`);
            if(lim>0)cfg.push(`${lim}분 제한`);
            const statusTxt=!activeToday?'오늘은 타이머 꺼짐':over?'오늘 제한 초과':lim>0?fmtRemain(rem):`${Math.floor(used/60)}분 사용`;
            return `<div class="t-row">
                <div class="t-top">
                    <span class="t-domain">${r.domain}</span>
                    <span class="t-stat${over?' over':''}">${statusTxt}</span>
                </div>
                ${lim>0&&activeToday?`<div class="t-bar-bg"><div class="t-bar-fill" style="width:${pct}%;background:${bc}"></div></div>`:''}
                ${cfg.length?`<div class="t-cfg">${cfg.join(' · ')}</div>`:''}
            </div>`;
        }).join('');
    }

    /* ═══════════════════ 메인 ═══════════════════ */
    function renderMain(){
        const D=_D,td=getLocalDate();
        const sorted=Object.entries(D[td]||{}).sort((a,b)=>b[1]-a[1]);
        const total=sorted.reduce((s,[,v])=>s+v,0);
        const top3=sorted.slice(0,3),rest=sorted.slice(3).reduce((s,[,v])=>s+v,0);
        const COLS=['#4285F4','#00BCD4','#34A853'];
        const dSegs=[...top3.map(([,v],i)=>({v,c:COLS[i]})),...(rest>0?[{v:rest,c:'#C7C7CC'}]:[])];
        const w7=Array.from({length:7},(_,i)=>getLocalDate(6-i));
        const wTot=w7.reduce((s,d)=>s+Object.values(D[d]||{}).reduce((a,b)=>a+b,0),0);
        const wAct=w7.filter(d=>Object.values(D[d]||{}).reduce((a,b)=>a+b,0)>0).length;
        const wAvg=wAct?Math.round(wTot/wAct):0;
        const wS={};
        for(const d of w7)for(const[s,v]of Object.entries(D[d]||{}))wS[s]=(wS[s]||0)+v;
        const wTop3=Object.entries(wS).sort((a,b)=>b[1]-a[1]).slice(0,3);
        return `
        <div class="hdr">
            <span class="hdr-title">디지털 웰빙</span>
            <button class="ico" id="btn-refresh" type="button">${ICO.refresh}</button>
            <button class="ico" id="btn-weekly"  type="button">${ICO.weekly}</button>
            <button class="ico" id="btn-settings" type="button">${ICO.settings}</button>
        </div>
        <div class="card card-tap" style="margin-top:8px" id="today-card">
            <div class="today-lbl">오늘의 사이트 사용 시간</div>
            <div class="today-body">
                <div class="today-left"><div class="big">${fmt(total)}</div></div>
                <div class="today-right">${donut(dSegs)}</div>
            </div>
            <div class="app-rows">
                ${top3.map(([site,secs],i)=>`
                    <div class="app-row">
                        <span class="a-dot" style="background:${COLS[i]}"></span>
                        <span class="a-name">${site}</span>
                        <span class="a-time">${fmt(secs)}</span>
                    </div>`).join('')}
                ${!total?`<div style="text-align:center;font-size:13px;color:var(--t3);padding:8px 0">데이터 없음</div>`:''}
            </div>
        </div>
        <div class="mini-row">
            <div class="mc"><div class="mc-lbl">최근 7일</div>
                <div class="mc-val">${fmtS(wTot)}</div><div class="mc-sub">누적</div></div>
            <div class="mc"><div class="mc-lbl">일 평균</div>
                <div class="mc-val">${fmtS(wAvg)}</div><div class="mc-sub">활동일 기준</div></div>
            <div class="mc"><div class="mc-lbl">방문 사이트</div>
                <div class="mc-val">${sorted.length}</div><div class="mc-sub">개</div></div>
        </div>
        <div class="slbl-row">
            <span class="slbl-txt">TOP 3</span>
            <span class="badge">이번 주</span>
        </div>
        <div class="card">
            ${wTop3.length?wTop3.map(([s,v],i)=>`
                <div class="lrow">
                    <span class="l-rank">${i+1}</span>
                    ${iconLI(s,i)}
                    <span class="l-name">${s}</span>
                    <span class="l-time">${fmt(v)}</span>
                </div>`).join('')
            :'<div class="empty-msg">데이터 없음</div>'}
        </div>
        <div class="slbl-row">
            <span class="slbl-txt">사이트 타이머</span>
            <button id="btn-manage" type="button"
                    style="background:none;border:none;cursor:pointer;font:inherit;
                           color:var(--pri);font-size:13px;padding:0">관리</button>
        </div>
        <div class="card">${renderTimerList(D,td)}</div>`;
    }

    /* ═══════════════════ 대시보드 ═══════════════════ */
    function renderDash(){
        const D=_D,td=getLocalDate();
        const days=Array.from({length:14},(_,i)=>getLocalDate(13-i));
        const tots=days.map(d=>Object.values(D[d]||{}).reduce((a,b)=>a+b,0));
        const maxT=Math.max(...tots,1);
        const allS={};
        for(const d of days)for(const[s,v]of Object.entries(D[d]||{}))allS[s]=(allS[s]||0)+v;
        const top3=Object.entries(allS).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s])=>s);
        const C3=['#4285F4','#00BCD4','#34A853'];
        const bc=s=>{const i=top3.indexOf(s);return i>=0?C3[i]:'#C7C7CC';};
        const selD=D[_dd]||{},selT=Object.values(selD).reduce((a,b)=>a+b,0);
        const selS=Object.entries(selD).sort((a,b)=>b[1]-a[1]);
        const sdt=new Date(_dd+'T00:00:00');
        const sLbl=_dd===td?'오늘':`${sdt.getMonth()+1}월 ${sdt.getDate()}일 (${DOW_KOR[sdt.getDay()]})`;
        return `
        <div class="hdr">
            <button class="ico ico-back" id="btn-back" type="button">${ICO.back}</button>
            <span class="hdr-title">대시보드</span>
        </div>
        <div class="date-wrap"><div class="date-scr" id="dscr">
            <div style="min-width:8px;flex-shrink:0"></div>
            ${days.map(d=>{
                const dt=new Date(d+'T00:00:00');
                const isT=d===td,isSel=d===_dd;
                return `<div class="dpill${isSel?' sel':''}${isT&&!isSel?' today':''}" data-date="${d}">
                    <div class="dpill-dow">${DOW_KOR[dt.getDay()]}</div>
                    <div class="dpill-num">${dt.getDate()}</div>
                </div>`;
            }).join('')}
            <div style="min-width:8px;flex-shrink:0"></div>
        </div></div>
        <div class="card" style="padding:20px">
            <div class="big">${fmt(selT)}</div>
            <div style="font-size:13px;color:var(--t2);margin-top:4px">${sLbl} · ${selS.length}개 사이트</div>
        </div>
        <div class="card" style="padding:16px 12px 8px">
            <div class="schart" id="schart">
                ${days.map((d,i)=>{
                    const dD=D[d]||{},dT=tots[i];
                    const bH=dT>0?Math.max(Math.round(dT/maxT*90),4):0;
                    const isSel=d===_dd,isT=d===td;
                    const dt=new Date(d+'T00:00:00');
                    const t3s=top3.map(s=>[s,dD[s]||0]).filter(([,v])=>v>0);
                    const rv=Object.entries(dD).filter(([s])=>!top3.includes(s)).reduce((s,[,v])=>s+v,0);
                    const segs=[...t3s,...(rv>0?[['__',rv]]:[])];
                    const segH=segs.map(([s,v])=>`<div style="flex:${v};background:${s==='__'?'#C7C7CC':bc(s)}"></div>`).join('');
                    return `<div class="scol${isSel?' sel':''}" data-date="${d}" title="${fmt(dT)}">
                        <div class="sbar" style="height:${bH}px">${segH}</div>
                        <div class="slb${isT?' today':''}${isSel?' sel':''}">${dt.getMonth()+1}/${dt.getDate()}</div>
                    </div>`;
                }).join('')}
            </div>
            <div class="s-legend">
                ${top3.map((s,i)=>`<div class="sl-item">
                    <span class="sl-dot" style="background:${C3[i]}"></span><span>${s}</span>
                </div>`).join('')}
            </div>
        </div>
        <div class="slbl-row">
            <span class="slbl-txt">사용 시간</span>
            <span class="badge">${sLbl}</span>
        </div>
        <div class="card">
            ${selS.length?selS.map(([s,v],i)=>`
                <div class="lrow">${iconLI(s,i)}
                    <span class="l-name">${s}</span>
                    <span class="l-time">${fmt(v)}</span>
                </div>`).join('')
            :'<div class="empty-msg">데이터 없음</div>'}
        </div>
        <div style="height:20px"></div>`;
    }

    /* ═══════════════════ 주간 리포트 ═══════════════════ */
    function renderWeekly(){
        const D=_D,td=getLocalDate();
        function wDays(off){
            const now=new Date(),dow=now.getDay();
            const sun=new Date(now);sun.setDate(now.getDate()-dow-(off*7));
            return Array.from({length:7},(_,i)=>{
                const d=new Date(sun);d.setDate(sun.getDate()+i);
                return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
            });
        }
        const wd=wDays(_wo);
        const dT=wd.map(d=>Object.values(D[d]||{}).reduce((a,b)=>a+b,0));
        const mxT=Math.max(...dT,1);
        const wTot=dT.reduce((a,b)=>a+b,0);
        const act=dT.filter(v=>v>0).length;
        const wAvg=act?Math.round(wTot/act):0;
        const avgPx=mxT>0?Math.min(Math.round(wAvg/mxT*90),85):0;
        const showAvg=wTot>0&&avgPx>0;
        const wS={};
        for(const d of wd)for(const[s,v]of Object.entries(D[d]||{}))wS[s]=(wS[s]||0)+v;
        const wTop5=Object.entries(wS).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const wTop3Sites=wTop5.slice(0,3).map(([s])=>s);
        const C3=['#4285F4','#00BCD4','#34A853'];
        const bc=s=>{const i=wTop3Sites.indexOf(s);return i>=0?C3[i]:'#C7C7CC';};
        const ws=new Date(wd[0]+'T00:00:00'),we=new Date(wd[6]+'T00:00:00');
        const range=`${ws.getMonth()+1}월 ${ws.getDate()}일-${we.getMonth()+1}월 ${we.getDate()}일`;
        return `
        <div class="hdr">
            <button class="ico ico-back" id="btn-back" type="button">${ICO.back}</button>
            <span class="hdr-title">주간 리포트</span>
        </div>
        <div class="wk-sub">${range}</div>
        <div class="wk-tabs">
            <button class="wk-tab${_wo===1?' active':''}" type="button" data-wo="1">지난 주</button>
            <button class="wk-tab${_wo===0?' active':''}" type="button" data-wo="0">이번 주</button>
        </div>
        <div class="slbl">주별 사용 시간</div>
        <div class="card" style="padding:20px 18px 16px">
            <div class="big">${fmt(wAvg)}</div>
            <div style="font-size:14px;color:var(--t2);margin-top:4px;margin-bottom:20px">하루 평균 사용 시간</div>
            <div class="wk-chart-outer">
                ${showAvg?`<div class="wk-avg-line" style="bottom:calc(20px + ${avgPx}px)">
                    <span class="wk-avg-lbl">평균</span></div>`:''}
                <div class="wk-bars">
                    ${wd.map((d,i)=>{
                        const dD=D[d]||{};
                        const pct=dT[i]>0?Math.max(Math.round(dT[i]/mxT*100),4):0;
                        const isT=d===td;
                        const t3s=wTop3Sites.map(s=>[s,dD[s]||0]).filter(([,v])=>v>0);
                        const rv=Object.entries(dD).filter(([s])=>!wTop3Sites.includes(s)).reduce((s,[,v])=>s+v,0);
                        const segs=[...t3s,...(rv>0?[['__',rv]]:[])];
                        const segH=segs.map(([s,v])=>`<div style="flex:${v};background:${s==='__'?'#C7C7CC':bc(s)}"></div>`).join('');
                        return `<div class="wk-col">
                            <div class="wk-bar${!pct?' zero':''}" style="height:${pct}%${pct?';display:flex;flex-direction:column-reverse':''}">${pct?segH:''}</div>
                            <div class="wk-lbl${isT?' today':''}">${DOW_KOR[i]}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <div class="wk-legend">
                ${wTop3Sites.map((s,i)=>`<div class="wl-item">
                    <span class="wl-dot" style="background:${C3[i]}"></span><span>${s}</span>
                </div>`).join('')}
                ${showAvg?`<div class="wl-item"><span class="wl-dash"></span><span>주간 평균</span></div>`:''}
            </div>
        </div>
        <div class="mini-row">
            <div class="mc"><div class="mc-lbl">주 합계</div>
                <div class="mc-val">${fmtS(wTot)}</div><div class="mc-sub">누적</div></div>
            <div class="mc"><div class="mc-lbl">일 평균</div>
                <div class="mc-val">${fmtS(wAvg)}</div><div class="mc-sub">활동일 기준</div></div>
            <div class="mc"><div class="mc-lbl">방문 사이트</div>
                <div class="mc-val">${Object.keys(wS).length}</div><div class="mc-sub">개</div></div>
        </div>
        ${wTop5.length?`
        <div class="slbl">사용 시간</div>
        <div class="card">
            ${wTop5.map(([s,v],i)=>`
                <div class="lrow"><span class="l-rank">${i+1}</span>
                    ${iconLI(s,i)}
                    <span class="l-name">${s}</span>
                    <span class="l-time">${fmt(v)}</span>
                </div>`).join('')}
        </div>`:''}
        <div style="height:20px"></div>`;
    }

    /* ═══════════════════ 설정 ═══════════════════ */
    function renderSettings(){
        const t=getTheme();const chk=v=>t===v?'✓':'';
        return `
        <div class="hdr">
            <button class="ico ico-back" id="btn-back" type="button">${ICO.back}</button>
            <span class="hdr-title">설정</span>
        </div>
        <div class="setting-section">화면 테마</div>
        <div class="card">
            <div class="s-row" id="th-auto"><div><div class="s-lbl">자동</div>
                <div class="s-sub">시스템 설정을 따릅니다</div></div>
                <span class="s-chk">${chk('auto')}</span></div>
            <div class="s-row" id="th-light"><div class="s-lbl">라이트 모드</div>
                <span class="s-chk">${chk('light')}</span></div>
            <div class="s-row" id="th-dark"><div class="s-lbl">다크 모드</div>
                <span class="s-chk">${chk('dark')}</span></div>
        </div>
        <div class="setting-section">데이터</div>
        <div class="card">
            <div class="s-row" id="raw-toggle">
                <div class="s-lbl">데이터 원본 보기</div>
                <span class="s-arr" id="raw-arr">▸</span>
            </div>
        </div>
        <pre class="raw-pre" id="raw-pre"></pre>
        <div style="height:20px"></div>`;
    }

    /* ═══════════════════ 규칙 목록 (Samsung 스타일) ═══════════════════ */
    function renderRules(){
        const rules=getRules(),groups=getGroups();
        const D=_D,td=getLocalDate(),todayDow=new Date().getDay();
        return `
        <div class="hdr">
            <button class="ico ico-back" id="btn-back" type="button">${ICO.back}</button>
            <span class="hdr-title">사이트 타이머</span>
            <button class="ico" id="btn-add-rule" type="button" title="규칙 추가">${ICO.add}</button>
            <button class="ico" id="btn-add-group" type="button" title="그룹 추가" style="font-size:12px;font-weight:700">G+</button>
        </div>
        <div class="rules-desc">타이머는 매일 자정에 초기화됩니다. 그룹에 포함된 사이트는 한 곳에서 대기 완료 시 그룹 전체가 허용됩니다.</div>

        ${rules.length?`
        <div class="card">
            ${rules.map(r=>{
                const activeToday=!r.days||r.days.length===0||r.days.includes(todayDow);
                const used=(D[td]||{})[r.domain]||0;
                const lim=r.limitMins||0;
                const pct=lim>0?Math.min(Math.round(used/(lim*60)*100),100):0;
                const rem=lim>0?Math.max(lim*60-used,0):-1;
                const over=lim>0&&used>=lim*60;
                const bc=over?'#EA4335':pct>75?'#FF9500':'var(--pri)';
                const statusTxt=!activeToday?'오늘은 타이머 꺼짐':over?'오늘 제한 초과':lim>0?fmtRemain(rem):`오늘 ${Math.floor(used/60)}분 사용`;
                const grp=r.groupId?groups.find(g=>g.id===r.groupId):null;
                const daysLabel=r.days&&r.days.length>0&&r.days.length<7?
                    r.days.map(d=>DOW_KOR[d]).join('·')+' 활성':'매일';
                const notifParts=[];
                if(r.notify?.min10)notifParts.push('10분 전');
                if(r.notify?.min5)notifParts.push('5분 전');
                if(r.notify?.min1)notifParts.push('1분 전');
                return `<div class="r-item">
                    <div class="r-item-hdr">
                        <div class="r-item-name">
                            <img class="r-item-favicon"
                                 src="https://www.google.com/s2/favicons?domain=${r.domain}&sz=32"
                                 onerror="this.style.display='none'" alt="">
                            ${r.domain}
                        </div>
                        <div style="display:flex;align-items:center;gap:6px">
                            ${r.delaySec>0?`<span class="r-item-badge">${r.delaySec}초</span>`:''}
                            <button class="edit-btn" data-rule-id="${r.id}">편집</button>
                        </div>
                    </div>
                    <div class="r-item-status${over?' over':''}${!activeToday?' off':''}">${statusTxt}</div>
                    <div class="r-bar-bg"><div class="r-bar-fill" style="width:${activeToday?pct:0}%;background:${bc}"></div></div>
                    ${grp?`<div class="r-grp-tag">그룹: ${grp.name}</div>`:''}
                    <div class="r-days-tag">${daysLabel}${notifParts.length?' · 알림 '+notifParts.join(', '):''}</div>
                </div>`;
            }).join('')}
        </div>`
        :'<div class="empty-msg" style="margin:0 16px;background:var(--sf);border-radius:18px;box-shadow:var(--sh)">등록된 규칙 없음<br><span style="font-size:12px">상단 + 버튼으로 추가하세요</span></div>'}

        ${groups.length?`
        <div class="slbl">그룹</div>
        <div class="card">
            ${groups.map(g=>{
                const members=rules.filter(r=>r.groupId===g.id);
                const grpUsed=getGroupUsage(g.id);
                const grpLim=g.limitMins||0;
                const grpPct=grpLim>0?Math.min(Math.round(grpUsed/(grpLim*60)*100),100):0;
                const grpOver=grpLim>0&&grpUsed>=grpLim*60;
                return `<div class="grp-item">
                    <div class="grp-item-hdr">
                        <span class="grp-item-name">${g.name}</span>
                        <div style="display:flex;gap:8px;align-items:center">
                            <span style="font-size:12px;color:var(--t2)">${members.length}개 사이트</span>
                            <button class="edit-btn" data-group-id="${g.id}">편집</button>
                        </div>
                    </div>
                    <div class="grp-members">${members.map(r=>r.domain).join(', ')||'사이트 없음'}</div>
                    ${grpLim>0?`
                    <div class="grp-status${grpOver?' over':''}">${grpOver?'그룹 제한 초과':fmtRemain(Math.max(grpLim*60-grpUsed,0))}</div>
                    <div class="r-bar-bg"><div class="r-bar-fill" style="width:${grpPct}%;background:${grpOver?'#EA4335':'var(--pri)'}"></div></div>
                    `:`<div class="grp-status">하루 ${Math.floor(grpUsed/60)}분 사용</div>`}
                </div>`;
            }).join('')}
        </div>`:''}
        <div style="height:24px"></div>`;
    }

    /* ═══════════════════ 규칙 폼 (추가/편집) ═══════════════════ */
    function renderRuleForm(){
        const isEdit=!!_editRuleId;
        const r=isEdit?getRules().find(x=>x.id===_editRuleId)||{}:{};
        const groups=getGroups();
        const days=r.days||[];
        const notify=r.notify||{min1:false,min5:false,min10:false};
        const mkTog=(key,label)=>`
            <div class="tog-row">
                <span class="tog-lbl">${label}</span>
                <button class="tog${notify[key]?' on':''}" type="button" data-tog="${key}"></button>
            </div>`;
        return `
        <div class="hdr">
            <button class="ico ico-back" id="btn-back" type="button">${ICO.back}</button>
            <span class="hdr-title">${isEdit?'규칙 편집':'새 규칙'}</span>
            ${isEdit?`<button class="ico" id="btn-del-rule" type="button" style="color:#EA4335">${ICO.trash}</button>`:'<div style="width:36px"></div>'}
        </div>

        <div class="form-card">
            <div class="form-lbl">도메인</div>
            <input id="r-domain" class="form-input" placeholder="예: youtube.com"
                   autocomplete="off" autocapitalize="none" spellcheck="false"
                   value="${r.domain||''}"${isEdit?' readonly':''}>
            <div class="form-sep"></div>
            <div class="form-lbl">활성 요일 (비우면 매일)</div>
            <div class="day-row">
                ${DOW_KOR.map((d,i)=>`
                    <button class="day-btn${days.includes(i)?' on':''}" type="button" data-day="${i}">${d}</button>`).join('')}
            </div>
        </div>

        <div class="form-card">
            <div class="num-grid">
                <div class="num-cell">
                    <div class="form-lbl">대기 (초)</div>
                    <input id="r-delay" class="num-input" type="number" min="0" max="600"
                           value="${r.delaySec!==undefined?r.delaySec:30}">
                </div>
                <div class="num-cell">
                    <div class="form-lbl">자유 (분)</div>
                    <input id="r-free" class="num-input" type="number" min="0" max="1440"
                           value="${r.freeMins!==undefined?r.freeMins:15}">
                </div>
                <div class="num-cell">
                    <div class="form-lbl">제한 (분)</div>
                    <input id="r-limit" class="num-input" type="number" min="0" max="1440"
                           value="${r.limitMins!==undefined?r.limitMins:0}">
                </div>
            </div>
            <div class="hint">· 대기: 접속 시 카운트다운 · 자유: 대기 후 허용 시간 · 제한: 하루 최대 (0=제한 없음)</div>
        </div>

        <div class="form-card">
            <div class="form-lbl">잠금 전 알림</div>
            ${mkTog('min10','10분 전 알림')}
            ${mkTog('min5','5분 전 알림')}
            ${mkTog('min1','1분 전 알림')}
        </div>

        <div class="form-card">
            <div class="form-lbl">그룹 (선택)</div>
            <select id="r-group" class="form-select">
                <option value="">없음</option>
                ${groups.map(g=>`<option value="${g.id}"${r.groupId===g.id?' selected':''}>${g.name}</option>`).join('')}
            </select>
        </div>

        <div style="margin:0 16px">
            <button id="btn-save-rule" class="save-btn" type="button">${isEdit?'저장':'추가'}</button>
        </div>
        <div style="height:24px"></div>`;
    }

    /* ═══════════════════ 그룹 폼 ═══════════════════ */
    function renderGroupForm(){
        const isEdit=!!_editGroupId;
        const g=isEdit?getGroups().find(x=>x.id===_editGroupId)||{}:{};
        const allRules=getRules();
        const memberIds=allRules.filter(r=>r.groupId===_editGroupId).map(r=>r.id);
        return `
        <div class="hdr">
            <button class="ico ico-back" id="btn-back" type="button">${ICO.back}</button>
            <span class="hdr-title">${isEdit?'그룹 편집':'새 그룹'}</span>
            ${isEdit?`<button class="ico" id="btn-del-group" type="button" style="color:#EA4335">${ICO.trash}</button>`:'<div style="width:36px"></div>'}
        </div>

        <div class="form-card">
            <div class="form-lbl">그룹 이름</div>
            <input id="g-name" class="form-input" placeholder="예: SNS" value="${g.name||''}">
            <div class="form-sep"></div>
            <div class="form-lbl">그룹 총 일일 제한 (분, 0=없음)</div>
            <input id="g-limit" class="num-input" type="number" min="0" max="1440"
                   style="width:120px" value="${g.limitMins||0}">
        </div>

        ${allRules.length?`
        <div class="form-card">
            <div class="form-lbl">포함할 사이트</div>
            ${allRules.map(r=>`
                <div class="tog-row">
                    <span class="tog-lbl">${r.domain}</span>
                    <button class="tog${memberIds.includes(r.id)?' on':''}" type="button" data-member="${r.id}"></button>
                </div>`).join('')}
        </div>`:''}

        <div style="margin:0 16px">
            <button id="btn-save-group" class="save-btn" type="button">${isEdit?'저장':'추가'}</button>
        </div>
        <div style="height:24px"></div>`;
    }

    /* ═══════════════════ 이벤트 ═══════════════════ */
    function attachEv(view){
        const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('click',fn);};

        if(view==='main'){
            on('btn-refresh',()=>location.reload());
            on('btn-weekly', ()=>{_wo=0;nav('weekly');});
            on('btn-settings',()=>nav('settings'));
            on('today-card',  ()=>nav('dash'));
            on('btn-manage',  ()=>nav('rules'));
        }

        if(view==='dash'){
            on('btn-back',()=>nav('main'));
            const sc=document.getElementById('dscr');
            if(sc){
                sc.addEventListener('click',e=>{
                    const p=e.target.closest('.dpill');
                    if(p)nav('dash',{date:p.dataset.date});
                });
                sc.querySelector('.dpill.sel')?.scrollIntoView({behavior:'auto',inline:'center',block:'nearest'});
            }
            document.getElementById('schart')?.addEventListener('click',e=>{
                const c=e.target.closest('.scol');if(c)nav('dash',{date:c.dataset.date});
            });
        }

        if(view==='weekly'){
            on('btn-back',()=>nav('main'));
            document.querySelectorAll('.wk-tab').forEach(b=>{
                b.addEventListener('click',()=>nav('weekly',{wo:parseInt(b.dataset.wo)}));
            });
        }

        if(view==='settings'){
            on('btn-back',()=>nav('main'));
            on('th-auto', ()=>{setTheme('auto'); nav('settings');});
            on('th-light',()=>{setTheme('light');nav('settings');});
            on('th-dark', ()=>{setTheme('dark'); nav('settings');});
            on('raw-toggle',()=>{
                const pre=document.getElementById('raw-pre');
                const arr=document.getElementById('raw-arr');
                if(!pre)return;
                if(pre.style.display==='block'){pre.style.display='none';if(arr)arr.textContent='▸';}
                else{
                    const raw={};
                    GM_listValues().filter(k=>k.startsWith(KEY_PREFIX)).sort()
                        .forEach(k=>{raw[k]=GM_getValue(k);});
                    pre.textContent=JSON.stringify(raw,null,2);
                    pre.style.display='block';if(arr)arr.textContent='▾';
                }
            });
        }

        if(view==='rules'){
            on('btn-back',()=>nav('main'));
            on('btn-add-rule', ()=>{_editRuleId=null;nav('rule-form');});
            on('btn-add-group',()=>{_editGroupId=null;nav('group-form');});
            document.querySelectorAll('.edit-btn[data-rule-id]').forEach(b=>{
                b.addEventListener('click',()=>nav('rule-form',{ruleId:b.dataset.ruleId}));
            });
            document.querySelectorAll('.edit-btn[data-group-id]').forEach(b=>{
                b.addEventListener('click',()=>nav('group-form',{groupId:b.dataset.groupId}));
            });
        }

        if(view==='rule-form'){
            on('btn-back',()=>nav('rules'));
            /* 요일 토글 */
            const days=new Set((_editRuleId?getRules().find(r=>r.id===_editRuleId)?.days||[]:[]));
            document.querySelectorAll('.day-btn').forEach(b=>{
                b.addEventListener('click',()=>{
                    const d=parseInt(b.dataset.day);
                    if(days.has(d)){days.delete(d);b.classList.remove('on');}
                    else{days.add(d);b.classList.add('on');}
                });
            });
            /* 알림 토글 */
            const notify={
                min1: !!(_editRuleId&&getRules().find(r=>r.id===_editRuleId)?.notify?.min1),
                min5: !!(_editRuleId&&getRules().find(r=>r.id===_editRuleId)?.notify?.min5),
                min10:!!(_editRuleId&&getRules().find(r=>r.id===_editRuleId)?.notify?.min10),
            };
            document.querySelectorAll('.tog[data-tog]').forEach(b=>{
                b.addEventListener('click',()=>{
                    const k=b.dataset.tog;
                    notify[k]=!notify[k];
                    b.classList.toggle('on',notify[k]);
                });
            });
            /* 삭제 */
            on('btn-del-rule',()=>{
                if(!confirm('이 규칙을 삭제할까요?'))return;
                saveRules(getRules().filter(r=>r.id!==_editRuleId));
                _editRuleId=null;nav('rules');
            });
            /* 저장 */
            on('btn-save-rule',()=>{
                const domEl=document.getElementById('r-domain');
                const domain=(domEl?.value||'').trim().replace(/^www\./i,'').toLowerCase();
                const delaySec=Math.max(0,parseInt(document.getElementById('r-delay')?.value||'0',10)||0);
                const freeMins=Math.max(0,parseInt(document.getElementById('r-free')?.value||'0',10)||0);
                const limitMins=Math.max(0,parseInt(document.getElementById('r-limit')?.value||'0',10)||0);
                const groupId=document.getElementById('r-group')?.value||'';
                if(!domain||!/^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$/i.test(domain)){
                    alert('올바른 도메인을 입력해주세요\n예: youtube.com');return;
                }
                const rules=getRules();
                if(_editRuleId){
                    const idx=rules.findIndex(r=>r.id===_editRuleId);
                    if(idx>=0)rules[idx]={...rules[idx],delaySec,freeMins,limitMins,
                        groupId:groupId||null,days:[...days],notify:{...notify}};
                } else {
                    if(rules.find(r=>domainMatches(r.domain,domain))){
                        alert('이미 등록된 도메인입니다');return;
                    }
                    rules.push({id:genId(),domain,delaySec,freeMins,limitMins,
                        groupId:groupId||null,days:[...days],notify:{...notify}});
                }
                saveRules(rules);_editRuleId=null;nav('rules');
            });
        }

        if(view==='group-form'){
            on('btn-back',()=>nav('rules'));
            /* 멤버 토글 */
            const members=new Set(getRules().filter(r=>r.groupId===_editGroupId).map(r=>r.id));
            document.querySelectorAll('.tog[data-member]').forEach(b=>{
                b.addEventListener('click',()=>{
                    const id=b.dataset.member;
                    if(members.has(id)){members.delete(id);b.classList.remove('on');}
                    else{members.add(id);b.classList.add('on');}
                });
            });
            /* 삭제 */
            on('btn-del-group',()=>{
                if(!confirm('이 그룹을 삭제할까요?\n(포함된 규칙의 그룹 연결도 해제됩니다)'))return;
                saveGroups(getGroups().filter(g=>g.id!==_editGroupId));
                const rules=getRules().map(r=>r.groupId===_editGroupId?{...r,groupId:null}:r);
                saveRules(rules);_editGroupId=null;nav('rules');
            });
            /* 저장 */
            on('btn-save-group',()=>{
                const name=(document.getElementById('g-name')?.value||'').trim();
                const limitMins=Math.max(0,parseInt(document.getElementById('g-limit')?.value||'0',10)||0);
                if(!name){alert('그룹 이름을 입력해주세요');return;}
                const groups=getGroups();
                let gid=_editGroupId;
                if(gid){
                    const idx=groups.findIndex(g=>g.id===gid);
                    if(idx>=0)groups[idx]={...groups[idx],name,limitMins};
                } else {
                    gid=genId();groups.push({id:gid,name,limitMins});
                }
                saveGroups(groups);
                /* 멤버 업데이트 */
                const rules=getRules().map(r=>{
                    if(members.has(r.id))return{...r,groupId:gid};
                    if(r.groupId===gid)return{...r,groupId:null};
                    return r;
                });
                saveRules(rules);_editGroupId=null;nav('rules');
            });
        }
    }

    /* ═════════════════════ 진입점 ════════════════════ */
    if(location.href.startsWith(VIEWER_URL)){
        initViewer();
    } else {
        initTracker();
        initOverlay();
    }

})();
/* (function () {
  'use strict';

  const loc = window.location;

  if (
    loc.hostname !== 'aajkrvv.github.io' ||
    loc.pathname !== '/web-digital-wellbeing-script'
  ) return;

  const customHTML = `
    <!DOCTYPE html>
    <html lang="ko-KR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>디지털 웰빙</title>
        <style>
          body {
            background-color: #FDFCF8;
          }
        </style>
    </head>
    <body>
        <header>
            <p>디지털 웰빙</p>
            <nav>
                <button>새로고침</button>
                <button>주간 리포트</button>
                <button>설정</button>
            </nav>
        </header>
        <div>
          <p>오늘의 웹사이트 사용 시간</p>
          <p>n시간 n분</p>
        </div>
        <div>
          <canvas id="web-usage-time-chart"></canvas>
        </div>
        <footer>
            <p>aajkrvv</p>
        </footer>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
        <script>
          const webUsageTimeChart = document.getElementById('web-usage-time-chart');
          new Chart(webUsageTimeChart, {
            type: 'bar',
            date: {
              
            }
          });
        <\/script>
    </body>
    </html>
  `;

  document.open();
  document.write(customHTML);
  document.close();
})(); */