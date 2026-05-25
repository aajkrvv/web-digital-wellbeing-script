// ==UserScript==
// @name         Web Digital Wellbeing Script
// @namespace    aajkrvv
// @version      2.0.0
// @description  1
// @author       aajkrvv
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @homepageURL  https://github.com/aajkrvv/web-digital-wellbeing-script
// @supportURL   https://github.com/aajkrvv/web-digital-wellbeing-script
// ==/UserScript==
(function () {
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
})();