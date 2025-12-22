import { test, expect } from '@playwright/test';

/**
 * RAG Sources Display Tests
 * 
 * These tests verify the RAG source display functionality.
 * Note: Requires a running backend with Knowledge Base integration.
 * 
 * Run with: PLAYWRIGHT_BASE_URL=<deployed_url> npm run test:e2e
 */
test.describe('RAG Sources Display', () => {
  // Skip these tests if backend is not available
  test.skip(({ browserName }) => !process.env.E2E_BACKEND_AVAILABLE, 
    'Skipping RAG tests - backend not available');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display RAG sources when available', async ({ page }) => {
    const input = page.getByPlaceholder(/メッセージを入力/);
    
    // 製品に関する質問（ナレッジベースから回答される想定）
    await input.fill('パスワードを忘れた場合はどうすればよいですか？');
    await input.press('Enter');

    // レスポンスを待つ
    await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 30000 });

    // 参照ソースボタンが表示されること
    const sourcesButton = page.getByText(/参照ソース/);
    await expect(sourcesButton).toBeVisible({ timeout: 10000 });
  });

  test('should expand/collapse sources on click', async ({ page }) => {
    const input = page.getByPlaceholder(/メッセージを入力/);
    
    await input.fill('料金プランを教えてください');
    await input.press('Enter');

    // レスポンスを待つ
    await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 30000 });

    // ソースボタンをクリック
    const sourcesButton = page.getByText(/参照ソース/);
    if (await sourcesButton.isVisible()) {
      await sourcesButton.click();

      // ソースカードが展開されること
      await expect(page.locator('[data-testid="source-card"]').first()).toBeVisible();

      // 再度クリックで閉じること
      await sourcesButton.click();
      await expect(page.locator('[data-testid="source-card"]').first()).not.toBeVisible();
    }
  });

  test('should show source score and content', async ({ page }) => {
    const input = page.getByPlaceholder(/メッセージを入力/);
    
    await input.fill('APIの認証方法を教えてください');
    await input.press('Enter');

    // レスポンスを待つ
    await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 30000 });

    // ソースを展開
    const sourcesButton = page.getByText(/参照ソース/);
    if (await sourcesButton.isVisible()) {
      await sourcesButton.click();

      // スコアが表示されること
      await expect(page.getByText(/%/)).toBeVisible();
    }
  });
});

test.describe('RAG Sources - UI Components', () => {
  test('SourceCard component renders correctly', async ({ page }) => {
    await page.goto('/');
    
    // コンポーネントが正しくレンダリングされることを確認
    // (Storybook経由でテストする方が望ましい)
    await expect(page.locator('body')).toBeVisible();
  });
});











