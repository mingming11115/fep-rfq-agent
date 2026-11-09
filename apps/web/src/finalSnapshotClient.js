import {api} from './authClient.js';

const project = id => `/projects/${encodeURIComponent(id)}`;

export function snapshotClient(client = api) {
  return {
    configure: (id, input) => client.put(`${project(id)}/final-review-config`, input),
    submit: (id, snapshot) => client.post(`${project(id)}/snapshots`, snapshot),
    vote: (id, snapshotId, input) => client.post(`${project(id)}/snapshots/${encodeURIComponent(snapshotId)}/vote`, input),
    setMember: (id, userId, input) => client.patch(`${project(id)}/members/${encodeURIComponent(userId)}`, input),
  };
}
