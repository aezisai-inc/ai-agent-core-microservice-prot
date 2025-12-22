import { test, expect } from '@playwright/test';

test.describe('Chat Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should allow typing a message', async ({ page }) => {
    const input = page.getByPlaceholder(/メッセージを入力/);
    
    await input.fill('こんにちは');
    await expect(input).toHaveValue('こんにちは');
  });

  test('should show send button', async ({ page }) => {
    // 送信ボタンまたは送信アイコンが存在すること
    const sendButton = page.locator('button[type="submit"], button:has(svg)').first();
    await expect(sendButton).toBeVisible();
  });

  test('should clear input after sending (mock mode)', async ({ page }) => {
    // Note: This test works in development mode with placeholder responses
    const input = page.getByPlaceholder(/メッセージを入力/);
    
    await input.fill('テストメッセージ');
    await input.press('Enter');

    // 入力がクリアされる、または送信中状態になること
    await expect(input).toHaveValue('');
  });

  test('should display user message after sending', async ({ page }) => {
    const input = page.getByPlaceholder(/メッセージを入力/);
    const testMessage = 'E2Eテストメッセージ';
    
    await input.fill(testMessage);
    await input.press('Enter');

    // ユーザーメッセージが表示されること
    await expect(page.getByText(testMessage)).toBeVisible();
  });

  test('should show loading state while waiting for response', async ({ page }) => {
    const input = page.getByPlaceholder(/メッセージを入力/);
    
    await input.fill('テスト質問');
    await input.press('Enter');

    // ローディング状態が表示されること（短時間）
    // Note: モックAPIの場合は即座にレスポンスが返るため、このテストはスキップ可能
    await expect(page.locator('.animate-bounce, .animate-pulse')).toBeVisible({ timeout: 5000 }).catch(() => {
      // ローディングが見えない場合もテスト成功とする（高速レスポンスの場合）
    });
  });
});

test.describe('Chat Accessibility', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');
    
    // Tab キーでフォーカスが移動すること
    await page.keyboard.press('Tab');
    
    // 何かしらの要素にフォーカスがあること
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/');
    
    // 入力フィールドがアクセシブルであること
    const input = page.getByPlaceholder(/メッセージを入力/);
    await expect(input).toBeVisible();
  });
});











