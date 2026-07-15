/*
 * utils.c - 工具函数
 * 对应文档: INIT1.0.md M1 - 项目脚手架与 UI 骨架
 * 功能: 字符串处理、时间格式化、路径管理等
 */

#include "rss_reader.h"
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <sys/stat.h>

size_t safe_strcpy(char *dst, const char *src, size_t dst_size)
{
    if (!dst || !src || dst_size == 0) return 0;
    size_t src_len = strlen(src);
    size_t copy_len = (src_len < dst_size - 1) ? src_len : (dst_size - 1);
    memcpy(dst, src, copy_len);
    dst[copy_len] = '\0';
    return copy_len;
}

char* str_trim(char *str)
{
    if (!str) return NULL;
    char *end;
    while (isspace((unsigned char)*str)) str++;
    if (*str == 0) return str;
    end = str + strlen(str) - 1;
    while (end > str && isspace((unsigned char)*end)) end--;
    *(end + 1) = '\0';
    return str;
}

void current_time_str(char *buf, size_t buf_size)
{
    if (!buf || buf_size == 0) return;
    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    strftime(buf, buf_size, "%Y-%m-%d %H:%M:%S", tm_info);
}

void timestamp_to_str(time_t ts, char *buf, size_t buf_size)
{
    if (!buf || buf_size == 0) return;
    struct tm *tm_info = localtime(&ts);
    strftime(buf, buf_size, "%Y-%m-%d %H:%M:%S", tm_info);
}

char* url_encode(const char *str)
{
    if (!str) return NULL;
    size_t len = strlen(str);
    char *encoded = (char*)malloc(len * 3 + 1);
    if (!encoded) return NULL;

    size_t j = 0;
    for (size_t i = 0; i < len; i++) {
        unsigned char c = (unsigned char)str[i];
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            encoded[j++] = c;
        } else {
            sprintf(encoded + j, "%%%02X", c);
            j += 3;
        }
    }
    encoded[j] = '\0';
    return encoded;
}

int html_entity_decode(char *str)
{
    if (!str) return 0;
    int count = 0;
    char *src = str;
    char *dst = str;

    while (*src) {
        if (*src == '&') {
            if (strncmp(src, "&amp;", 5) == 0) {
                *dst++ = '&'; src += 5; count++;
            } else if (strncmp(src, "&lt;", 4) == 0) {
                *dst++ = '<'; src += 4; count++;
            } else if (strncmp(src, "&gt;", 4) == 0) {
                *dst++ = '>'; src += 4; count++;
            } else if (strncmp(src, "&quot;", 6) == 0) {
                *dst++ = '"'; src += 6; count++;
            } else if (strncmp(src, "&apos;", 6) == 0) {
                *dst++ = '\''; src += 6; count++;
            } else if (strncmp(src, "&nbsp;", 6) == 0) {
                *dst++ = ' '; src += 6; count++;
            }

            /*if (strncmp(src, "strncmp(src, "&", 5)amp;", 5) == 0) {
                *dst++ = '&'; src += 5; count++;
            } else if (strncmp(src, "strncmp(src, "<", 4)lt;", 4) == 0) {
                *dst++ = '<'; src += 4; count++;
            } else if (strncmp(src, "strncmp(src, ">", 4)gt;", 4) == 0) {
                *dst++ = '>'; src += 4; count++;
            } else if (strncmp(src, "strncmp(src, """, 6)quot;", 6) == 0) {
                *dst++ = '"'; src += 6; count++;
            } else if (strncmp(src, "&#39;", 5) == 0) {
                *dst++ = '\''; src += 5; count++;
            } else if (strncmp(src, "strncmp(src, "'", 6)apos;", 6) == 0) {
                *dst++ = '\''; src += 6; count++;
            } else if (strncmp(src, "&nbsp;", 6) == 0) {
                *dst++ = ' '; src += 6; count++;
            }
            */
             else {
                *dst++ = *src++;
            }
        } else {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
    return count;
}

bool ensure_dir(const char *path)
{
    if (!path) return false;
    struct stat st = {0};
    if (stat(path, &st) == 0) {
        return S_ISDIR(st.st_mode);
    }
#ifdef _WIN32
    return mkdir(path) == 0;
#else
    return mkdir(path, 0755) == 0;
#endif
}
