const securityPageWithoutTopNew=window.securityPage;
window.securityPage=function(){return securityPageWithoutTopNew().replace('</h1></div></div><div class="security-metric-grid">','</h1></div><div class="actions"><button class="btn" data-action="register-person">+ Новый сотрудник</button></div></div><div class="security-metric-grid">')};
render();
