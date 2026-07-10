// StorageUtil：localStorage 读写封装，带容错（无存储权限时返回 null 不抛错）
const SAVE_KEY = "wuXingCycleSave";

class StorageUtil {
  static available() {
    try {
      const t = "__wx_test__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }
  static read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  static write(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  static remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
  static get SAVE_KEY() { return SAVE_KEY; }
}
