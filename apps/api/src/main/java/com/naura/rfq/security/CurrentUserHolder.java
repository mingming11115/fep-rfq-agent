package com.naura.rfq.security;

/** Request-scoped holder filled by {@link AuthInterceptor} and cleared in afterCompletion. */
public final class CurrentUserHolder {

    private static final ThreadLocal<CurrentUser> CURRENT = new ThreadLocal<>();

    private CurrentUserHolder() {
    }

    public static void set(CurrentUser user) {
        CURRENT.set(user);
    }

    public static CurrentUser get() {
        return CURRENT.get();
    }

    public static CurrentUser require() {
        CurrentUser user = CURRENT.get();
        if (user == null) {
            throw new IllegalStateException("当前请求没有登录身份");
        }
        return user;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
