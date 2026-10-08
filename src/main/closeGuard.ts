import { BrowserWindow, dialog, ipcMain } from 'electron';

let requestSequence = 0;

/** レンダラーへ問い合わせを送り、requestId が一致する応答を待つ。 */
function askRenderer<T>(window: BrowserWindow, channel: string, resultChannel: string): Promise<T> {
  return new Promise(resolve => {
    const requestId = ++requestSequence;
    const listener = (event: Electron.IpcMainEvent, respondedId: number, value: T) => {
      if (event.sender !== window.webContents || respondedId !== requestId) return;
      ipcMain.removeListener(resultChannel, listener);
      resolve(value);
    };
    ipcMain.on(resultChannel, listener);
    window.webContents.send(channel, requestId);
  });
}

/**
 * 未保存の変更があるときに、ウィンドウを閉じる前に確認する。
 * 「保存して終了」はレンダラーの通常の保存処理を使い、保存できた場合だけ閉じる。
 */
export function installCloseGuard(window: BrowserWindow): void {
  let allowClose = false;
  let deciding = false;

  const closeNow = () => {
    allowClose = true;
    if (!window.isDestroyed()) window.close();
  };

  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (deciding) return;
    deciding = true;

    void (async () => {
      try {
        // 画面側が落ちている場合は問い合わせに応答できないため、確認せずに閉じる。
        if (window.webContents.isCrashed()) {
          closeNow();
          return;
        }
        const state = await askRenderer<{ dirty: boolean }>(window, 'app:query-unsaved', 'app:unsaved-result');
        if (!state?.dirty) {
          closeNow();
          return;
        }

        const { response } = await dialog.showMessageBox(window, {
          type: 'warning',
          title: '未保存の変更',
          message: 'プロジェクトに保存していない変更があります。',
          detail: '保存せずに終了すると、最後に保存した後の変更はプロジェクトファイルに反映されません（自動保存には残り、次回起動時に復元されます）。',
          buttons: ['保存して終了', '保存せずに終了', 'キャンセル'],
          defaultId: 0,
          cancelId: 2,
          noLink: true
        });

        if (response === 1) {
          closeNow();
        } else if (response === 0) {
          const saved = await askRenderer<boolean>(window, 'app:save-before-close', 'app:save-before-close-result');
          if (saved) closeNow();
        }
      } catch (error) {
        console.error('[closeGuard] 終了確認に失敗したため終了します:', error);
        closeNow();
      } finally {
        deciding = false;
      }
    })();
  });
}
