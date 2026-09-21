import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import JournalArticlePage from '@/pages/JournalArticlePage';
import { parseJournalBody, journalFromRow } from '@/services/db/journal';

const mocks=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/services/db/journal',async(original)=>({...await original<object>(),getPublishedJournal:mocks.get}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/components/atoms',()=>({Seal:()=>null}));
const article={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'A published article',kicker:'Journal',excerpt:'Short',body:'First paragraph\n\n## Heading\n\n> A quotation\n\n<script>window.bad=true</script>',author:'Editor',kanji:'香',cover:null,read_minutes:3,published_at:'2026-09-20T00:00:00Z'};
const show=()=>render(<MemoryRouter initialEntries={['/journal/'+article.id]}><Routes><Route path="/journal/:id" element={<JournalArticlePage />} /></Routes></MemoryRouter>);
beforeEach(()=>mocks.get.mockReset());
describe('published journal content',()=>{
 it('preserves paragraphs, headings and quotation blocks without interpreting HTML',()=>{
  expect(parseJournalBody(article.body)).toEqual([{type:'lede',text:'First paragraph'},{type:'h2',text:'Heading'},{type:'pull',text:'A quotation'},{type:'p',text:'<script>window.bad=true</script>'}]);
 });
 it('renders published article text safely',async()=>{
  mocks.get.mockResolvedValue(journalFromRow(article));const view=show();
  expect(await screen.findByRole('heading',{name:article.title})).toBeInTheDocument();
  expect(screen.getByText('<script>window.bad=true</script>')).toBeInTheDocument();
  expect(view.container.querySelector('script')).toBeNull();
 });
 it('shows an unpublished/missing article state instead of revealing a draft',async()=>{
  mocks.get.mockResolvedValue(null);show();
  expect(await screen.findByRole('heading',{name:'文章尚未發布或已下架'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'返回香誌'})).toHaveAttribute('href','/journal');
 });
 it('allows retry after a transient read error',async()=>{
  mocks.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(journalFromRow(article));show();
  await userEvent.click(await screen.findByRole('button',{name:'重試'}));
  await waitFor(()=>expect(screen.getByRole('heading',{name:article.title})).toBeInTheDocument());
 });
});
