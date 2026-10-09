// What `import ... from 'chapterjs'` loads at runtime: the public API, plus
// `asset()`, whose type depends on the project it is imported from. Its
// type is not here but in the `.chapterjs/` folder of each project.

export * from './index.js';
export { asset } from './assets/asset.js';
