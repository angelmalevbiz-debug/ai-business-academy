import { expect, type Page } from '@playwright/test';

export async function ensureNavigation(page: Page) {
  const library = page.getByRole('link', { name: 'Примери', exact: true });
  const trigger = page.getByRole('button', { name: 'Отвори менюто', exact: true });
  // Visibility can linger during the drawer closing transition. Its expanded
  // state tells us whether the user must open the menu for this route.
  if (await trigger.isVisible() && await trigger.getAttribute('aria-expanded') === 'false') {
    await trigger.click();
    await expect(library).toBeVisible();
  }
}

export async function openRegistration(page: Page) {
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Създай профил', exact: true }).click();
}

export async function openLevelList(page: Page) {
  const summary = page.locator('summary').filter({ hasText: /^Всички уроци$/ });
  const details = summary.locator('xpath=..');
  if (await details.getAttribute('open') === null) await summary.click();
  return details;
}

export async function openUniverseTopics(page: Page) {
  const trigger = page.locator('.universe-map-toggle');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
}

export async function openLessonMaterial(page: Page) {
  const material=page.locator('#lesson-material');
  if(await material.getAttribute('open')===null) await material.locator(':scope > summary').click();
  await expect(material).toHaveAttribute('open','');
  return material;
}

export async function openUniverseMaterial(page: Page) {
  const material=page.locator('.universe-unit > .scene-reference');
  if(await material.getAttribute('open')===null) await material.locator(':scope > summary').click();
  await expect(material).toHaveAttribute('open','');
  return material;
}

export async function openDailyPlanForm(page: Page) {
  const edit=page.getByRole('button',{name:'Редактирай стъпката',exact:true});
  if(await edit.isVisible())await edit.click();else await page.getByRole('button',{name:'Имам друга задача',exact:true}).click();
  await expect(page.locator('#goal-action')).toBeVisible();
}

export async function openToolsMore(page: Page) {
  const more=page.locator('.tools-more');
  if(await more.getAttribute('open')===null) await more.locator(':scope > summary').click();
  await expect(more).toHaveAttribute('open','');
}
