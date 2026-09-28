import * as React from 'react';
import type {
  ColorSystemAuthoringRefinementViewV1,
  ColorSystemAuthoringCatalogViewV1,
} from '../types/colorSystemAuthoringViewV1';
import type { ColorSystemAuthoringActionV1 } from '../types/colorSystemAuthoringMessagesV1';
import {
  AuthoringChoiceV1 as Choice,
  AuthoringChecksV1 as Checks,
} from './ColorSystemAuthoringControlsV1';

type Send = (action: ColorSystemAuthoringActionV1, payload?: unknown) => void;
const key = (value: { kind: string; id: string }) => `${value.kind}:${value.id}`;
function RoleEditor({
  rule,
  refinement,
  disabled,
  send,
}: {
  rule: ColorSystemAuthoringRefinementViewV1['roles'][number];
  refinement: ColorSystemAuthoringRefinementViewV1;
  disabled: boolean;
  send: Send;
}) {
  const [contexts, setContexts] = React.useState(rule.contextIds);
  const [modes, setModes] = React.useState(rule.modeIds);
  const [members, setMembers] = React.useState(rule.members.map(key));
  return (
    <details>
      <summary>Edit {rule.label}</summary>
      <fieldset disabled={disabled}>
        <legend>{rule.role}</legend>
        <p>
          Change this proposed role within the retained brief. The edited rule requires a new
          review; unrelated confirmed decisions remain in place.
        </p>
        <Checks
          label="Contexts for this role"
          options={refinement.contexts}
          values={contexts}
          onChange={setContexts}
        />
        <Checks
          label="Modes for this role"
          options={refinement.modes}
          values={modes}
          onChange={setModes}
        />
        <Checks
          label="Colors, families or scales assigned to this role"
          options={refinement.selectors.map(item => ({
            id: key(item),
            label: `${item.label} (${item.kind})`,
          }))}
          values={members}
          onChange={setMembers}
        />
        <button
          type="button"
          disabled={!contexts.length || !modes.length || !members.length}
          onClick={() =>
            send('analyze', {
              kind: 'role',
              request: {
                recipeHash: refinement.recipeHash,
                fragmentId: rule.fragmentId,
                ruleId: rule.id,
                contextIds: contexts,
                modeIds: modes,
                members: refinement.selectors
                  .filter(item => members.includes(key(item)))
                  .map(({ kind, id }) => ({ kind, id })),
              },
            })
          }
        >
          Recompute this role
        </button>
      </fieldset>
    </details>
  );
}
function CatalogChoices({
  catalog,
  disabled,
  send,
}: {
  catalog: ColorSystemAuthoringCatalogViewV1;
  disabled: boolean;
  send: Send;
}) {
  const [candidateId, setCandidateId] = React.useState('');
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  const candidate = catalog.candidates.find(item => item.id === candidateId);
  return (
    <fieldset disabled={disabled}>
      <legend>Catalog results</legend>
      <p>
        These are source-based candidates. Selecting one recomputes every affected application and
        checks the existing locks.
      </p>
      <Choice
        label="Candidate to inspect"
        value={candidateId}
        options={catalog.candidates}
        onChange={id => {
          setCandidateId(id);
          setMappings({});
        }}
      />
      {candidate && (
        <>
          <p>{candidate.disclosure}</p>
          <ul>
            {candidate.colors.map(color => (
              <li key={color.id}>
                {color.label}
                {color.values.map(value => (
                  <span
                    key={value.modeId}
                    style={{ display: 'inline-flex', gap: 5, marginLeft: 8, alignItems: 'center' }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        display: 'inline-block',
                        background: value.css,
                        border: '1px solid #8888',
                      }}
                    />
                    {value.modeId}
                    <details>
                      <summary>Exact value</summary>
                      <pre>{value.native}</pre>
                    </details>
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {catalog.references.map(ref => (
            <div key={key(ref)}>
              <Choice
                label={`Replace ${ref.label} (${ref.kind})`}
                value={mappings[key(ref)] ?? ''}
                options={candidate.targets.filter(target => target.kind === ref.kind)}
                onChange={id => setMappings(previous => ({ ...previous, [key(ref)]: id }))}
              />
              {!ref.editable && (
                <p>
                  This reference also belongs to another construction. Preserve its identity here,
                  or edit that construction explicitly.
                </p>
              )}
              <details>
                <summary>Affected references ({ref.paths.length})</summary>
                <ul>
                  {ref.paths.map(path => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
          <button
            type="button"
            disabled={catalog.references.some(
              ref => !mappings[key(ref)] || (!ref.editable && mappings[key(ref)] !== ref.id)
            )}
            onClick={() =>
              send('analyze', {
                kind: 'catalog',
                request: {
                  ...catalog.request,
                  discoveryHash: catalog.discoveryHash,
                  candidateId: candidate.id,
                  candidateHash: candidate.hash,
                  mappings: catalog.references.map(ref => ({
                    kind: ref.kind,
                    fromId: ref.id,
                    toId: mappings[key(ref)],
                  })),
                },
              })
            }
          >
            Replace catalog fragment and reassess
          </button>
        </>
      )}
    </fieldset>
  );
}
function CatalogEditor({
  fragment,
  recipeHash,
  catalog,
  disabled,
  send,
}: {
  fragment: ColorSystemAuthoringRefinementViewV1['catalogs'][number];
  recipeHash: string;
  catalog: ColorSystemAuthoringCatalogViewV1 | null;
  disabled: boolean;
  send: Send;
}) {
  const [provider, setProvider] = React.useState<string>(fragment.provider);
  const [category, setCategory] = React.useState('');
  const [schemes, setSchemes] = React.useState<Record<string, string>>({});
  return (
    <details>
      <summary>Replace catalog fragment {fragment.id}</summary>
      <fieldset disabled={disabled}>
        <legend>Find a replacement</legend>
        <p>Current choice: {fragment.candidateId}</p>
        <Choice
          label="Color library"
          value={provider}
          options={[
            { id: 'wada', label: 'Wada combinations' },
            { id: 'werner', label: 'Werner references' },
            { id: 'radix', label: 'Exact Radix scales' },
          ]}
          onChange={setProvider}
        />
        {provider === 'radix' && (
          <>
            <Choice
              label="Radix category"
              value={category}
              options={[
                { id: 'accent', label: 'Accent' },
                { id: 'neutral', label: 'Neutral' },
                { id: 'either', label: 'Either' },
              ]}
              onChange={setCategory}
            />
            {fragment.modes.map(mode => (
              <Choice
                key={mode.id}
                label={`Published scheme for ${mode.label}`}
                value={schemes[mode.id] ?? ''}
                options={[
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                ]}
                onChange={scheme => setSchemes(previous => ({ ...previous, [mode.id]: scheme }))}
              />
            ))}
          </>
        )}
        <button
          type="button"
          disabled={
            !provider ||
            (provider === 'radix' && (!category || fragment.modes.some(mode => !schemes[mode.id])))
          }
          onClick={() =>
            send('inspect', {
              kind: 'catalog',
              request: {
                recipeHash,
                fragmentId: fragment.id,
                provider,
                ...(provider === 'radix'
                  ? {
                      radix: {
                        category,
                        modes: fragment.modes.map(mode => ({
                          modeId: mode.id,
                          scheme: schemes[mode.id],
                        })),
                      },
                    }
                  : {}),
              },
            })
          }
        >
          Find catalog choices
        </button>
      </fieldset>
      {catalog?.fragmentId === fragment.id && (
        <CatalogChoices
          key={catalog.discoveryHash}
          catalog={catalog}
          disabled={disabled}
          send={send}
        />
      )}
    </details>
  );
}

export function ColorSystemAuthoringRefinementV1({
  refinement,
  catalog,
  disabled,
  send,
}: {
  refinement: ColorSystemAuthoringRefinementViewV1;
  catalog: ColorSystemAuthoringCatalogViewV1 | null;
  disabled: boolean;
  send: Send;
}) {
  if (!refinement.catalogs.length && !refinement.roles.length) return null;
  return (
    <section aria-label="Refine the selected color system">
      <h3>Refine the selected design</h3>
      {refinement.catalogs.map(fragment => (
        <CatalogEditor
          key={`${refinement.recipeHash}:${fragment.id}`}
          fragment={fragment}
          recipeHash={refinement.recipeHash}
          catalog={catalog}
          disabled={disabled}
          send={send}
        />
      ))}
      {refinement.roles.map(rule => (
        <RoleEditor
          key={`${refinement.recipeHash}:${rule.fragmentId}:${rule.id}`}
          rule={rule}
          refinement={refinement}
          disabled={disabled}
          send={send}
        />
      ))}
    </section>
  );
}
