import React from 'react';
import { LayoutDashboard, Zap, CalendarDays, TrendingUp, Landmark, Search, Settings, Bell, Eye, EyeOff, Sun, Moon, Menu, RefreshCw, Download } from 'lucide-react';
import { APP_LOGO_ICON } from '../assets/logo';
import { financeSyncStatus } from '../utils/workspacePresentation';

export type FinanceSection = 'dashboard' | 'events' | 'calendar' | 'projections' | 'funding';
export const FINANCE_SECTIONS = [
  { id: 'dashboard', label: 'Money', icon: LayoutDashboard },
  { id: 'events', label: 'Projects', icon: Zap },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'projections', label: 'Forecast', icon: TrendingUp },
  { id: 'funding', label: 'Funding', icon: Landmark },
] as const;
interface Props {
  section: FinanceSection; onNavigate: (tab: FinanceSection) => void;
  theme: 'light' | 'dark'; onTheme: () => void;
  privacy: boolean; onPrivacy: () => void; syncing: boolean; error: string | null;
  unsaved: boolean; onSync: () => void; onSearch: () => void;
  onSettings: () => void; onNotifications: () => void; unread: number;
  onMenu: () => void; onInstall?: () => void; currency: string; isAdmin: boolean;
}
export function FinanceWorkspaceChrome(p: Props) {
  const status = financeSyncStatus(p.syncing, p.error, p.unsaved);
  const sections = FINANCE_SECTIONS.filter(x => p.isAdmin || x.id === 'events' || x.id === 'calendar');
  const current = FINANCE_SECTIONS.find(x => x.id === p.section)?.label || 'Workspace';
  return <>
    <a className="ff-skip" href="#ffpro-main">Skip to workspace</a>
    <aside className="ff-sidebar" aria-label="FFPRO navigation">
      <a href="/" className="ff-brand" aria-label="FFPRO home"><img src={APP_LOGO_ICON} alt="" width="44" height="44" /><span>FFPRO<small>BY VISION79 DIGITAL</small></span></a>
      <p className="ff-nav-label">Finance workspace</p>
      <nav aria-label="FFPRO workspace">{sections.map(({id,label,icon:Icon})=><button key={id} type="button" onClick={()=>p.onNavigate(id)} aria-current={p.section===id?'page':undefined}><Icon size={19}/>{label}</button>)}</nav>
      <div className="ff-sidebar-foot"><strong>Your finance workspace</strong><span>Display: {p.currency === 'XCD' ? 'EC$ · XCD' : 'US$ · USD'}</span><small>Changing display currency does not convert stored amounts.</small></div>
      {p.onInstall && <button className="ff-hub-return" onClick={p.onInstall}><Download size={16}/>Install FFPRO</button>}
      <a className="ff-hub-return" href="/api/platform/start">← Back to Vision79 Hub</a>
      <small className="ff-tagline">From Idea to Advantage.</small>
    </aside>
    <header className="ff-topbar">
      <div className="ff-topbar-brand"><img src={APP_LOGO_ICON} alt="" width="36" height="36"/><div><span>VISION79 / FFPRO</span><strong>{current}</strong></div></div>
      <div className="ff-toolbar" aria-label="Workspace controls">
        <button type="button" className={`ff-sync ff-sync-${status.tone}`} onClick={p.onSync} disabled={p.syncing} title={status.description} aria-label={status.description}><RefreshCw size={15} className={p.syncing?'animate-spin':''}/><span>{status.label}</span></button>
        <button type="button" onClick={p.onSearch} aria-label="Search and quick actions" title="Search and quick actions"><Search size={18}/></button>
        <button type="button" onClick={p.onPrivacy} aria-label={p.privacy?'Show financial amounts':'Hide financial amounts'} aria-pressed={p.privacy} title={p.privacy?'Show amounts':'Hide amounts'}>{p.privacy?<EyeOff size={18}/>:<Eye size={18}/>}</button>
        <button type="button" onClick={p.onTheme} aria-label={p.theme==='dark'?'Switch to light appearance':'Switch to dark appearance'} title="Appearance">{p.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
        <button type="button" onClick={p.onNotifications} aria-label={`Notifications${p.unread>0?`, ${p.unread} unread`:''}`} title="Notifications"><Bell size={18}/>{p.unread>0&&<span className="ff-unread">{p.unread>99?'99+':p.unread}</span>}</button>
        <button type="button" onClick={p.onSettings} aria-label="Open settings" title="Settings"><Settings size={18}/></button>
        <button type="button" onClick={p.onMenu} aria-label="Open workspace menu" title="Account and navigation"><Menu size={19}/></button>
      </div>
    </header>
  </>;
}

import { AccessibleDialog } from './AccessibleDialog';
import { X, LogOut, Keyboard, Plus } from 'lucide-react';
export function FinanceWorkspaceMenu(p: Props & {onClose:()=>void;onSignOut:()=>void;onAdd:()=>void;onShortcuts:()=>void;username:string}) {
  const sections=FINANCE_SECTIONS.filter(x=>p.isAdmin||x.id==='events'||x.id==='calendar');
  return <AccessibleDialog label="FFPRO workspace menu" onClose={p.onClose}>
    <section className="ff-menu-panel">
      <div className="ff-menu-heading"><div><span className="ff-menu-eyebrow">FFPRO · VISION79</span><h2>Workspace menu</h2><p>{p.username}</p></div><button type="button" onClick={p.onClose} aria-label="Close workspace menu"><X size={20}/></button></div>
      <nav aria-label="Workspace menu navigation">{sections.map(({id,label,icon:Icon})=><button type="button" key={id} aria-current={p.section===id?'page':undefined} onClick={()=>{p.onNavigate(id);p.onClose();}}><Icon size={19}/>{label}</button>)}</nav>
      <div className="ff-menu-tools">
        {p.isAdmin&&<button type="button" onClick={()=>{p.onClose();p.onAdd();}}><Plus size={18}/>Add Transaction</button>}
        <button type="button" onClick={()=>{p.onClose();p.onSettings();}}><Settings size={18}/>Settings</button>
        <button type="button" onClick={()=>{p.onClose();p.onShortcuts();}}><Keyboard size={18}/>Keyboard shortcuts</button>
        <a href="/api/platform/start">← Back to Vision79 Hub</a>
        <button type="button" onClick={()=>{p.onClose();p.onSignOut();}}><LogOut size={18}/>Sign out</button>
      </div>
    </section>
  </AccessibleDialog>;
}
