import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should display the chat interface', async ({ page }) => {
    await page.goto('/');

    // ヘッダーが表示されていること
    await expect(page.locator('header')).toBeVisible();

    // チャット入力エリアが表示されていること
    await expect(page.getByPlaceholder(/メッセージを入力/)).toBeVisible();

    // 初期メッセージが表示されていること
    await expect(page.getByText('Agentic RAG Assistant')).toBeVisible();
  });

  test('should have correct page title', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/Agentic RAG/);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // モバイルでもチャット入力が表示されること
    await expect(page.getByPlaceholder(/メッセージを入力/)).toBeVisible();
  });
});











