package com.naura.rfq.support;

import java.io.InputStream;
import java.util.Arrays;

public final class TestStreams {
    private TestStreams() { }

    public static InputStream zeroStream(long length) {
        return new InputStream() {
            private long left = length;

            @Override public int read() {
                if (left == 0) {
                    return -1;
                }
                left--;
                return 0;
            }

            @Override public int read(byte[] data, int offset, int count) {
                if (count == 0) {
                    return 0;
                }
                if (left == 0) {
                    return -1;
                }
                int n = (int) Math.min(left, count);
                Arrays.fill(data, offset, offset + n, (byte) 0);
                left -= n;
                return n;
            }
        };
    }
}
