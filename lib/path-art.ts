export function pathArt(id: string) {
  return ({ automation: '/brand/automation-cover.png', 'ai-development': '/brand/development-cover.png', 'ai-for-business': '/brand/business-cover.png' } as Record<string,string>)[id] || '/brand/academy-process.png';
}
