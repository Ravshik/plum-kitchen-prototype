(function () {
  const openDrawerBeforeBackButton = window.openDrawer;

  window.openDrawer = function (shiftId) {
    openDrawerBeforeBackButton(shiftId);

    const shift = state.shifts.find(item => item.id === Number(shiftId));
    const drawer = document.querySelector('#drawer');
    const heading = drawer.querySelector('.drawer-head > div');
    if (!shift || !heading) return;

    heading.insertAdjacentHTML(
      'afterbegin',
      `<button type="button" class="shift-drawer-back" aria-label="Вернуться в карточку сотрудника">
        <span aria-hidden="true">←</span> Карточка сотрудника
      </button>`
    );

    heading.querySelector('.shift-drawer-back').onclick = () => {
      if (currentRole === 'Охрана' && typeof openSecurityPersonDrawer === 'function') {
        currentSecurityPersonId = shift.personId;
        openSecurityPersonDrawer(shift.personId);
      } else {
        openPersonDrawer(shift.personId);
      }
      drawer.scrollTop = 0;
    };

    drawer.scrollTop = 0;
  };
})();
