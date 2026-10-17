import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTodo } from '../lib/todos.mjs';
test('shared tasks validate dates, names, and family-only tagging',()=>{
  const members=[{id:'colby'},{id:'jessica'}];
  assert.deepEqual(validateTodo({title:' Get groceries ',due:'2026-10-17',members:['colby','jessica','colby'],notes:'Milk'},members),{title:'Get groceries',due:'2026-10-17',members:['colby','jessica'],notes:'Milk'});
  assert.equal(validateTodo({title:'Undated',members:['colby']},members).due,null);
  for(const bad of [{title:''},{due:'2026-02-30'},{due:'next week'},{members:[]},{members:['outsider']},{notes:7}])assert.throws(()=>validateTodo({title:'Task',members:['colby'],...bad},members));
});
