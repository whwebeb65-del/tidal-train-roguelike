export function renderResetSaveDialog(): string {
  return `<dialog id="reset-save-dialog" class="reset-save-dialog"
    aria-labelledby="reset-save-title" aria-describedby="reset-save-description">
    <div class="reset-save-dialog__paper">
      <span class="reset-save-dialog__seal" aria-hidden="true">本机存档</span>
      <h2 id="reset-save-title">清空本机进度？</h2>
      <p id="reset-save-description">将删除当前浏览器保存的角色、装备、货币、航线与档案等游戏进度。清空后无法在游戏内恢复；声音、画质等设置会保留。</p>
      <div class="reset-save-dialog__actions">
        <button type="button" data-action="cancel-reset-save" autofocus>保留存档</button>
        <button type="button" data-action="confirm-reset-save">清空存档</button>
      </div>
    </div>
  </dialog>`;
}
