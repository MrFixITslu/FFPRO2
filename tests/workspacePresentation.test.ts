import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { financeSyncStatus, readFinanceAppearance, isUsableBriefing } from '../src/utils/workspacePresentation';
import { FinanceWorkspaceChrome } from '../src/components/FinanceWorkspaceChrome';

test('save status never claims saved while pending, failed or actively syncing',()=>{
  assert.equal(financeSyncStatus(false,null,false).label,'Saved');
  assert.equal(financeSyncStatus(false,null,true).label,'Unsaved changes');
  assert.equal(financeSyncStatus(false,'offline',true).label,'Save needs attention');
  assert.equal(financeSyncStatus(true,'previous error',true).label,'Saving…');
  assert.doesNotMatch(financeSyncStatus(false,'offline',true).description,/Changes saved/);
});
test('appearance defaults to light when storage is absent, blocked or invalid',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>{throw Error('blocked')}}});
    assert.equal(readFinanceAppearance(),'light');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'unknown'}});
    assert.equal(readFinanceAppearance(),'light');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'dark'}});
    assert.equal(readFinanceAppearance(),'dark');
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
test('workspace chrome identifies current section, explicit amount toggle and honest sync state',()=>{
  const noop=()=>{};
  const html=renderToStaticMarkup(React.createElement(FinanceWorkspaceChrome,{section:'events',onNavigate:noop,theme:'light',onTheme:noop,privacy:true,onPrivacy:noop,syncing:false,error:'offline',unsaved:true,onSync:noop,onSearch:noop,onSettings:noop,onNotifications:noop,unread:3,onMenu:noop,currency:'XCD',isAdmin:false}));
  assert.match(html,/aria-current="page"[^>]*>[\s\S]*?Projects/);
  assert.match(html,/Show financial amounts/);assert.match(html,/Save needs attention/);
  assert.match(html,/does not convert stored amounts/);
  assert.doesNotMatch(html,/>Forecast<|>Funding<|>Money<|Cloud Synced/);
});

test('malformed briefings are rejected before rendering nested values',()=>{
  for(const value of [null,{}, {articles:[]}, {articles:[],briefing:{summary:'x',updatedAt:'invalid',takeaways:[]}}]) assert.equal(isUsableBriefing(value),false);
  assert.equal(isUsableBriefing({articles:[],briefing:{summary:'x',updatedAt:'2026-10-27T12:00:00Z',takeaways:['Review']}}),true);
});
