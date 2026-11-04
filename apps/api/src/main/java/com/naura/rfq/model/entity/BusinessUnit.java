package com.naura.rfq.model.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class BusinessUnit {

    private String id;

    private String code;

    private String name;

    private Instant createdAt = Instant.now();
}
