import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { Config } from "./config.js";
import type { User } from "./store/types.js";

export const SESSION_COOKIE = "tos_session";
const SESSION_TTL_S = 7 * 24 * 3600;
const SOCKET_TTL_S = 5 * 60;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
}

export const publicUser = (u: User): PublicUser => ({ id: u.id, name: u.name, email: u.email, isDemo: u.isDemo });

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function signSession(cfg: Config, userId: string) {
  return jwt.sign({ sub: userId }, cfg.jwtSecret, { expiresIn: SESSION_TTL_S, audience: "session", issuer: "teamos" });
}

/** Short-lived token the browser hands to the socket server (sockets can't rely on cross-site cookies). */
export function signSocketToken(cfg: Config, userId: string) {
  return jwt.sign({ sub: userId }, cfg.jwtSecret, { expiresIn: SOCKET_TTL_S, audience: "socket", issuer: "teamos" });
}

export function verifyToken(cfg: Config, token: string, audience: "session" | "socket"): string | null {
  try {
    const payload = jwt.verify(token, cfg.jwtSecret, { audience, issuer: "teamos" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(cfg: Config, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: "lax", // the web app reaches the API through a same-origin proxy
    maxAge: SESSION_TTL_S * 1000,
    path: "/",
  });
}

export function clearSessionCookie(cfg: Config, res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: cfg.cookieSecure, sameSite: "lax", path: "/" });
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export const requireAuth = (cfg: Config) => (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  const userId = token ? verifyToken(cfg, token, "session") : null;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Please sign in." });
    return;
  }
  req.userId = userId;
  next();
};
