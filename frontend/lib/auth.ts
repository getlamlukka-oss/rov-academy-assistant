// JWT อยู่ใน localStorage ตามข้อกำหนด; ไม่บันทึกรหัสผ่าน
const KEY = "rov_token";
export function getToken() {
  return typeof window === "undefined" ? null : localStorage.getItem(KEY);
}
export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}
export function clearToken() {
  localStorage.removeItem(KEY);
}
export function validToken() {
  try {
    const token = getToken();
    if (!token) return false;
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
