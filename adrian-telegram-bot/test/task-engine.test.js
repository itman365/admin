import test from "node:test";
import assert from "node:assert/strict";
import {safePlan,duePayload,hasTaskIntent} from "../src/task-engine.js";

test("explicit spoken 'напомни' always requires a time even when model forgets flag",()=>{
  const p=safePlan({operation:"create",title:"Оплатить дороги",date:"2026-11-05",time:"",remind:false},
    "Эдриан, напомни завтра оплатить дороги","2026-11-04");
  assert.equal(p.operation,"unknown");
  assert.match(p.reason,/время/);
});
test("recognizes safe scheduled Moscow task data",()=>{
  const p=safePlan({operation:"create",title:"Позвонить Андрею",date:"2026-11-05",time:"09:15",remind:true},
    "Напомни завтра в 9:15 позвонить Андрею","2026-11-04");
  assert.equal(p.operation,"create");
  assert.equal(duePayload(p).due_datetime,"2026-11-05T06:15:00.000Z");
});
test("invalid dates do not silently roll over to another month",()=>{
  const p=safePlan({operation:"create",title:"Купить материалы",date:"2026-11-31",time:"12:00"},
    "Поставь задачу 31 ноября","2026-11-04");
  assert.equal(p.operation,"unknown");
});
test("content generation is not mistaken for a Todoist task",()=>{
  const p=safePlan({operation:"create",title:"Написать рекламный пост"},
    "Эдриан, создай пост для КСБ","2026-11-04");
  assert.equal(p.operation,"chat");
});
test("destructive actions require an identified existing task",()=>{
  const p=safePlan({operation:"delete",target:"",date:"",time:""},"Удали задачу","2026-11-04");
  assert.equal(p.operation,"unknown");
});
test("planner detects reminder cues even after wake words",()=>{
  assert.equal(hasTaskIntent("Андрей, напомни, сегодня в 12.30"),true);
});
