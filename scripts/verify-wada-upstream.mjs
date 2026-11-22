import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const auditPath = new URL('../src/wadaSourceAudit.json', import.meta.url);
const localDataPath = new URL('../src/colors.json', import.meta.url);

const [audit, localData] = await Promise.all(
  [auditPath, localDataPath].map(async url => JSON.parse(await readFile(url, 'utf8')))
);

const response = await fetch(audit.upstream.rawUrl, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  throw new Error(`Unable to fetch pinned Wada source (${response.status} ${response.statusText})`);
}

const upstreamData = await response.json();
const semanticPayload = JSON.stringify(localData);
const upstreamPayload = JSON.stringify(upstreamData);
const semanticSha256 = createHash('sha256').update(semanticPayload).digest('hex');
const combinationIds = new Set(localData.flatMap(color => color.combinations));

if (semanticSha256 !== audit.upstream.semanticSha256) {
  throw new Error(
    `Local Wada semantic hash ${semanticSha256} does not match the ledger's ${audit.upstream.semanticSha256}`
  );
}

if (semanticPayload !== upstreamPayload) {
  throw new Error(
    `src/colors.json differs from ${audit.upstream.repository}/blob/${audit.upstream.commit}/${audit.upstream.path}`
  );
}

if (localData.length !== audit.corpusComparison.modernSeigenshaSelection.colorCount) {
  throw new Error(
    `Local Wada color count ${localData.length} does not match the ledger's ${audit.corpusComparison.modernSeigenshaSelection.colorCount}`
  );
}

if (combinationIds.size !== audit.corpusComparison.modernSeigenshaSelection.combinationCount) {
  throw new Error(
    `Local Wada combination count ${combinationIds.size} does not match the ledger's ${audit.corpusComparison.modernSeigenshaSelection.combinationCount}`
  );
}

console.log(
  `Verified ${localData.length} Wada colors across ${combinationIds.size} combinations against ${audit.upstream.commit}:${audit.upstream.path} (${semanticSha256}) from ${projectRoot}`
);
