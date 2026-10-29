import { CommunityApp } from '@/components/community-app';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <CommunityApp initialView={typeof params.view === 'string' ? params.view : 'overview'} initialLesson={typeof params.lesson === 'string' ? params.lesson : undefined} initialFrom={typeof params.from === 'string' ? params.from : undefined} initialFilter={typeof params.filter === 'string' ? params.filter : undefined} />;
}
