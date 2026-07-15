cmake_minimum_required(VERSION 3.16)
project(summer-rss-reader VERSION 1.0.0 LANGUAGES C)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

if(MSVC)
  add_compile_options(/W4 /wd4996 /wd4100)
else()
  add_compile_options(-Wall -Wextra)
endif()

# 跨平台查找库
find_package(SQLite3 REQUIRED)
find_package(CURL REQUIRED)
find_package(LibXml2 REQUIRED)

# 源文件（包含内嵌 cJSON）
set(SOURCES
    src/main.c
    src/db.c
    src/utils.c
    src/ipc.c
    src/fetch.c
    src/parser.c
    lib/cjson/cJSON.c
)

include_directories(include lib/cjson
    ${SQLite3_INCLUDE_DIRS}
    ${CURL_INCLUDE_DIRS}
    ${LIBXML2_INCLUDE_DIR}
)

add_executable(${PROJECT_NAME} ${SOURCES})

target_link_libraries(${PROJECT_NAME} PRIVATE
    ${SQLite3_LIBRARIES}
    ${CURL_LIBRARIES}
    ${LIBXML2_LIBRARIES}
)

# Linux 需要 pthread 和 m
if(UNIX AND NOT APPLE)
    target_link_libraries(${PROJECT_NAME} PRIVATE pthread m)
endif()
