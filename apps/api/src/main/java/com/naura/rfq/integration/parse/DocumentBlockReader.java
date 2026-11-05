package com.naura.rfq.integration.parse;

import com.naura.rfq.model.parse.RawBlock;
import java.nio.file.Path;
import java.util.List;

/** Reads one document format into ordered, source-anchored blocks. */
public interface DocumentBlockReader {

    boolean supports(String filename, String contentType);

    List<RawBlock> read(Path file) throws DocumentReadException;
}
