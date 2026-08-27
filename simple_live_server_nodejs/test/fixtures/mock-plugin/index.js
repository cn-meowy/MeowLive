// mock-plugin entry
//
// 同时返回 Schema A 与 Schema B 数据，用于 adapter 嗅探测试。
// 通过 _schema_kind = 'A' 或 'B' 切换。
var _schema_kind = 'A';

function _aItem(roomId, userId) {
  return {
    userName: 'User ' + roomId,
    roomTitle: 'Title ' + roomId,
    roomCover: 'https://example.com/cover/' + roomId,
    userHeadImg: 'https://example.com/avatar/' + userId,
    liveType: '0',
    liveState: '1',
    userId: String(userId),
    roomId: String(roomId),
    liveWatchedCount: '1234',
  };
}

function _bItem(roomId) {
  return {
    roomId: String(roomId),
    title: 'Title ' + roomId,
    cover: 'https://example.com/cover/' + roomId,
    userName: 'User ' + roomId,
    userAvatar: 'https://example.com/avatar/' + roomId,
    online: 4321,
    area: 'mock',
  };
}

globalThis.LiveParsePlugin = {
  apiVersion: 1,

  async getCategories() {
    return [
      {
        id: 'catA',
        title: 'Cat A',
        subList: [
          { id: 'subA1', parentId: 'catA', title: 'Sub A1' },
          { id: 'subA2', parentId: 'catA', title: 'Sub A2' },
        ],
      },
    ];
  },

  async getRooms(payload) {
    const id = payload && payload.id ? payload.id : 'all';
    if (id === 'INVALID_ID_THROW') {
      Host.raise('INVALID_ARGS', 'unsupported id', { id });
    }
    if (_schema_kind === 'A') {
      return [_aItem('1', '11'), _aItem('2', '22'), _aItem('3', '33')];
    }
    return [_bItem('1'), _bItem('2'), _bItem('3')];
  },

  async getRecommendRooms() {
    return this.getRooms({ id: 'recommended' });
  },

  async getPlayback() {
    return [
      {
        cdn: '主线路',
        qualitys: [
          {
            roomId: '1',
            title: '原画',
            qn: 10000,
            url: 'https://example.com/live-10000.flv',
            liveCodeType: 'flv',
            liveType: '1',
            headers: { Referer: 'https://example.com' },
            userAgent: 'MockUA/1.0',
          },
          {
            roomId: '1',
            title: '蓝光',
            qn: 400,
            url: 'https://example.com/live-400.flv',
            liveCodeType: 'flv',
            liveType: '1',
          },
        ],
      },
      {
        cdn: '备线路',
        qualitys: [
          {
            roomId: '1',
            title: '原画',
            qn: 10000,
            url: 'https://example.com/cdn2-10000.flv',
            liveCodeType: 'flv',
            liveType: '1',
          },
        ],
      },
    ];
  },

  async getRoomDetail(payload) {
    if (_schema_kind === 'A') {
      return _aItem(payload.roomId, payload.roomId);
    }
    return _bItem(payload.roomId);
  },

  async getLiveState(payload) {
    return { liveState: '1' };
  },

  async getDanmaku(payload) {
    return {
      transport: 'websocket',
      url: 'wss://example.com/danmaku/' + payload.roomId,
      headers: { 'User-Agent': 'MockUA/1.0' },
    };
  },

  async search(payload) {
    const keyword = String(payload.keyword || '');
    if (_schema_kind === 'A') {
      return [_aItem('100', '200')];
    }
    return [_bItem('100')];
  },

  async createDanmakuSession() {
    return { tick: 25 };
  },

  async onDanmakuOpen() {
    return [];
  },

  async onDanmakuFrame(payload) {
    Host.danmaku.emit('session-test', {
      type: 'chat',
      userName: 'Alice',
      message: 'hello ' + payload.payload.length,
    });
    return [
      { type: 'chat', userName: 'Bob', message: 'hi' },
      { type: 'superChat', userName: 'SC', message: 'cool', data: '99' },
    ];
  },

  async onDanmakuTick() {
    return null;
  },

  async destroyDanmakuSession() {
    return null;
  },

  async setCredential() {
    return { ok: true };
  },

  async getCredentialStatus() {
    return { state: 'valid', userId: 'u1', userName: 'Mock User' };
  },

  async validateCredential() {
    return { state: 'valid', userId: 'u1', userName: 'Mock User' };
  },

  async clearCredential() {
    return { ok: true };
  },

  // 测试用：切换返回 schema
  __setSchema(kind) {
    _schema_kind = kind;
  },
};