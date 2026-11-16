import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { accessStore } from '../src/state/accessStore';

// Existing fixtures describe an account whose Android migration is complete.
beforeEach(() => accessStore.setState({ mode: 'readwrite' }));
