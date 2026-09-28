// Follow the visible authoring flow; callers supply the source host when several are open.
export async function chooseGuidelineTask(scope, task) {
  await scope
    .getByRole('combobox', { name: 'What would you like to make?', exact: true })
    .selectOption(task);
}
