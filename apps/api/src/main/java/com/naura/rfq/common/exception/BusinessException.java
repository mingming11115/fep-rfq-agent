package com.naura.rfq.common.exception;

/** An expected business failure with a message safe to return to the caller. */
public class BusinessException extends RuntimeException {

    private final int code;

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
