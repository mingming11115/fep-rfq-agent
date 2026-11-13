package com.naura.rfq.mapper;

import org.apache.ibatis.annotations.Param;

/** Loaded by Flyway's bootstrap strategy before Spring initializes the application mappers. */
public interface DatabaseBootstrapMapper {

    boolean hasTable(@Param("table") String table);

    boolean hasColumn(@Param("table") String table, @Param("column") String column);

    boolean hasCompletedSeed(@Param("id") String id);

    boolean hasUsers();

    boolean hasSeedOtherThan(@Param("id") String id);

    int lockSeed(@Param("id") String id);
}
