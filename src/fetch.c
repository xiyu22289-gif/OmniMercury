#include "../include/rss_reader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

/* 内存缓冲结构，用于 curl 回写 */
struct fetch_buffer {
    char *data;
    size_t size;
};

static size_t fetch_write_callback(void *contents, size_t size, size_t nmemb, void *userp)
{
    size_t realsize = size * nmemb;
    struct fetch_buffer *buf = (struct fetch_buffer *)userp;

    char *ptr = realloc(buf->data, buf->size + realsize + 1);
    if (!ptr) {
        fprintf(stderr, "[fetch] realloc failed\n");
        return 0;
    }

    buf->data = ptr;
    memcpy(buf->data + buf->size, contents, realsize);
    buf->size += realsize;
    buf->data[buf->size] = '\0';

    return realsize;
}

int fetch_url(const char *url, char **out_body, size_t *out_size)
{
    CURL *curl;
    CURLcode res;
    struct fetch_buffer buf;

    if (!url || !out_body || !out_size) {
        return -1;
    }

    buf.data = malloc(1);
    if (!buf.data) {
        return -1;
    }
    buf.data[0] = '\0';
    buf.size = 0;

    curl = curl_easy_init();
    if (!curl) {
        free(buf.data);
        fprintf(stderr, "[fetch] curl_easy_init failed\n");
        return -1;
    }

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, fetch_write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &buf);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    /* 设置 User-Agent，避免一些服务器拒绝请求 */
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "SummerRSS/1.0");

    res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        fprintf(stderr, "[fetch] curl_easy_perform failed: %s\n", curl_easy_strerror(res));
        curl_easy_cleanup(curl);
        free(buf.data);
        return -1;
    }

    /* 获取 HTTP 状态码 */
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
    curl_easy_cleanup(curl);

    if (http_code != 200) {
        fprintf(stderr, "[fetch] HTTP error: %ld\n", http_code);
        free(buf.data);
        return -1;
    }

    *out_body = buf.data;
    *out_size = buf.size;

    return 0;
}

void fetch_free(char *body)
{
    free(body);
}