import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../src/core/core.js';
import * as calendar from '../src/ui/calendar.js';
import * as dashboard from '../src/ui/dashboard.js';
import {currentNutritionTargets} from '../src/data/access.js';

// Load the app's renderers and event handlers up to startup, without connecting a repository.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
export function createAppEnv(overrides={}){
 const events={},nodes={},location={hash:'#history'};
 for(const id of ['#navigation','#storage-banner','#main','#editor','#confirm-dialog','#history-results','#history-desc','.shell'])
  nodes[id]={dataset:{},querySelectorAll:()=>[],addEventListener(){}};
 const ctx=vm.createContext({...core,...calendar,...dashboard,currentNutritionTargets,location,
  today:()=>'2026-11-05',accessStage:()=>'ready',startupMode:()=>'firebase',createBootTiming:()=>({mark(){}}),
  matchMedia:()=>({matches:true}),backendName:()=>'Firebase',adminPage(){},document:{querySelector:s=>nodes[s]||null,
   addEventListener:(k,v)=>events[k]=v,body:{classList:{toggle(){}}}},window:{addEventListener:(k,v)=>events[k]=v,scrollTo(){}},
  ...overrides});
 const state=vm.runInContext(source.slice(source.indexOf('const boot='),source.indexOf('const resumeRetry='))+'\nstate;',ctx);
 return {ctx,state,events,nodes};
}
