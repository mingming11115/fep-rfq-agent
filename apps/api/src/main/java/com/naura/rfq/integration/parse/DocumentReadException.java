package com.naura.rfq.integration.parse;

/** Raised when a document cannot be read; the parse run records the message instead of failing the request. */
public class DocumentReadException extends Exception {

    public DocumentReadException(String message, Throwable cause) {
        super(message, cause);
    }

    public DocumentReadException(String message) {
        super(message);
    }
}
