// Jest setup file
import '@testing-library/jest-dom';

// Mock Audio API for tests
global.Audio = class Audio {
  constructor(src) {
    this.src = src;
    this.currentTime = 0;
    this.volume = 1;
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;
