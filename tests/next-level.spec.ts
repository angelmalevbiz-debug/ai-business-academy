import { expect, test } from '@playwright/test';

test('course orientation, bounded levels and the dismissible lesson list preserve real lesson navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=path');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await page.getByRole('button', { name: 'Промени посоката', exact: true }).click();
  const examples = [
    { direction: /^Автоматизирай задача/, steps: ['Задача', 'AI чернова', 'Твоя проверка'] },
    { direction: /^Направи AI продукт/, steps: ['Идея', 'Прототип', 'Първи тест'] },
    { direction: /^Подобри процес в бизнеса/, steps: ['Процес', 'Промяна', 'Резултат'] },
  ];
  for (const example of examples) {
    await page.getByRole('radio', { name: example.direction }).check();
    const flow = page.getByLabel('Пътят на проекта', { exact: true });
    await expect(flow).toBeVisible();
    for (const step of example.steps) await expect(flow.getByText(step, { exact: true })).toBeVisible();
  }
  await page.getByRole('radio', { name: /^Автоматизирай задача/ }).check();
  await page.getByRole('button', { name: 'Влез в картата', exact: true }).click();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const path = workspace.catalog.paths.find((item: { id: string }) => item.id === 'automation');
  const phase = page.locator('[data-phase="map"]');
  const scene = page.getByRole('region', { name: '3D карта на учебния път', exact: true });
  const previous = page.getByRole('button', { name: 'Предишно ниво', exact: true });
  const next = page.getByRole('button', { name: 'Следващо ниво', exact: true });
  await expect(phase.getByText(path.title, { exact: true }).first()).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(scene).toHaveAttribute('data-selected', path.lessonIds[0]);
  for (let index = 1; index < path.lessonIds.length; index++) {
    await next.click();
    await expect(scene).toHaveAttribute('data-selected', path.lessonIds[index]);
  }
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  const trigger = page.locator('summary').filter({ hasText: /^Всички уроци$/ });
  const list = page.locator('details').filter({ has: trigger });
  await trigger.click();
  await expect(list).toHaveAttribute('open', '');
  const items = list.locator('ol button');
  await expect(items).toHaveCount(path.lessonIds.length);
  await expect(items.last()).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('Escape');
  await expect(list).not.toHaveAttribute('open', '');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await phase.locator('h1').click();
  await expect(list).not.toHaveAttribute('open', '');
  await trigger.click();
  await items.first().click();
  await expect(list).not.toHaveAttribute('open', '');
  await expect(scene).toHaveAttribute('data-selected', path.lessonIds[0]);
  await expect(previous).toBeDisabled();
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`lesson=${path.lessonIds[0]}`));
});
