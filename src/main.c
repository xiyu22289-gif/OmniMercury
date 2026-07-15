/*
 * main.c - Summer RSS Reader 程序入口
 * 对应文档: INIT1.0.md M1 - 项目脚手架与 UI 骨架
 * 功能: 三栏布局框架、基础菜单导航、程序入口
 */

#include "rss_reader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

static sqlite3 *g_db = NULL;

static void print_banner(void);
static void print_three_column_layout(void);
static void print_main_menu(void);
static void handle_add_feed(void);
static void handle_list_feeds(void);
static void handle_list_articles(void);
static void handle_read_article(void);
static void clear_input_buffer(void);
static void trim_newline(char *str);

static void clear_input_buffer(void)
{
    int c;
    while ((c = getchar()) != '\n' && c != EOF) { }
}

static void trim_newline(char *str)
{
    size_t len = strlen(str);
    while (len > 0 && (str[len-1] == '\n' || str[len-1] == '\r')) {
        str[--len] = '\0';
    }
}

static void print_banner(void)
{
    printf("\n");
    printf("  +===============================================+\n");
    printf("  |        Summer RSS Reader v%-11s      |\n", PROJECT_VERSION);
    printf("  |    跨平台桌面端 . 本地优先 . 支持大模型     |\n");
    printf("  +===============================================+\n");
    printf("\n");
}

static void print_three_column_layout(void)
{
    printf("\n");
    printf("  +---------------------+---------------------+------------------+\n");
    printf("  | [订阅源列表]        | [文章列表]          | [阅读区]         |\n");
    printf("  +---------------------+---------------------+------------------+\n");
    printf("  |                     |                     |                  |\n");
    printf("  |  [暂无订阅源]       |  [请选择订阅源]     |  [请选择文章]    |\n");
    printf("  |                     |                     |                  |\n");
    printf("  |                     |                     |                  |\n");
    printf("  |                     |                     |                  |\n");
    printf("  |                     |                     |                  |\n");
    printf("  +---------------------+---------------------+------------------+\n");
    printf("\n");
}

static void print_main_menu(void)
{
    printf("  +----------- M1 项目脚手架与 UI 骨架 -----------+\n");
    printf("  |  [1] 添加订阅源                               |\n");
    printf("  |  [2] 列出所有订阅源                           |\n");
    printf("  |  [3] 查看文章列表                             |\n");
    printf("  |  [4] 阅读文章                                 |\n");
    printf("  |  [5] 显示三栏布局                             |\n");
    printf("  |  [0] 退出                                     |\n");
    printf("  +-----------------------------------------------+\n");
    printf("  请选择: ");
}

static void handle_add_feed(void)
{
    char url[MAX_URL_LEN];
    printf("\n  --- 添加订阅源 ---\n");
    printf("  请输入 RSS/Atom URL: ");
    if (fgets(url, sizeof(url), stdin) == NULL) return;
    trim_newline(url);
    if (strlen(url) == 0) { printf("  URL 不能为空\n"); return; }

    int feed_id = feed_add(g_db, url, FEED_TYPE_RSS);
    if (feed_id >= 0)
        printf("  [OK] 订阅源添加成功! ID: %d\n", feed_id);
    else
        printf("  [FAIL] 添加失败\n");
}

static void handle_list_feeds(void)
{
    Feed *feeds = NULL;
    int count = 0;
    printf("\n  --- 订阅源列表 ---\n");

    if (!feed_get_all(g_db, &feeds, &count)) {
        printf("  [FAIL] 获取失败\n");
        return;
    }
    if (count == 0) {
        printf("  (空) 暂无订阅源\n");
        free(feeds);
        return;
    }

    printf("  %-4s %-30s %-6s %-6s\n", "ID", "标题", "文章", "未读");
    for (int i = 0; i < count; i++) {
        printf("  %-4d %-30s %-6d %-6d\n",
               feeds[i].id,
               strlen(feeds[i].title) > 28 ? feeds[i].title : feeds[i].title,
               feeds[i].article_count, feeds[i].unread_count);
    }
    free(feeds);
}

static void handle_list_articles(void)
{
    int feed_id;
    Article *articles = NULL;
    int count = 0;
    printf("\n  --- 文章列表 ---\n");
    printf("  请输入订阅源 ID: ");
    if (scanf("%d", &feed_id) != 1) { clear_input_buffer(); return; }
    clear_input_buffer();

    if (!article_get_by_feed(g_db, feed_id, &articles, &count, ARTICLE_UNREAD)) {
        printf("  [FAIL] 获取失败\n");
        return;
    }
    if (count == 0) { printf("  (空) 暂无文章\n"); free(articles); return; }

    printf("  %-4s %-40s %-6s\n", "ID", "标题", "状态");
    for (int i = 0; i < count; i++) {
        const char *s = articles[i].status == ARTICLE_READ ? "已读" :
                        articles[i].status == ARTICLE_STARRED ? "星标" : "未读";
        printf("  %-4d %-40s %-6s\n", articles[i].id,
               strlen(articles[i].title) > 38 ? articles[i].title : articles[i].title, s);
    }
    free(articles);
}

static void handle_read_article(void)
{
    int article_id;
    Article article;
    printf("\n  --- 阅读文章 ---\n");
    printf("  请输入文章 ID: ");
    if (scanf("%d", &article_id) != 1) { clear_input_buffer(); return; }
    clear_input_buffer();

    if (!article_get_by_id(g_db, article_id, &article)) {
        printf("  [FAIL] 获取文章失败\n");
        return;
    }
    article_update_status(g_db, article_id, ARTICLE_READ);

    printf("\n  +===============================================+\n");
    printf("  | %s\n", article.title);
    printf("  | 作者: %s | 链接: %s\n",
           strlen(article.author) ? article.author : "未知", article.link);
    printf("  +===============================================+\n\n");

    if (strlen(article.description) > 0)
        printf("  %s\n", article.description);
    else
        printf("  (暂无内容)\n");

    printf("\n  按 Enter 返回...");
    getchar();
}

int main(int argc, char *argv[])
{
    (void)argc;
    (void)argv;
    int choice;
    char db_path[MAX_PATH_LEN] = {0};

    print_banner();

    const char *home_dir = getenv("HOME");
    if (home_dir) {
        snprintf(db_path, sizeof(db_path), "%s/.summer-rss-reader", home_dir);
        ensure_dir(db_path);
        snprintf(db_path, sizeof(db_path), "%s/.summer-rss-reader/reader.db", home_dir);
    } else {
        safe_strcpy(db_path, "reader.db", sizeof(db_path));
    }

    printf("  数据库路径: %s\n", db_path);
    g_db = db_init(db_path);
    if (!g_db) {
        fprintf(stderr, "  数据库初始化失败!\n");
        return EXIT_FAILURE;
    }
    printf("  数据库初始化成功\n");

    print_three_column_layout();

    while (1) {
        print_main_menu();
        if (scanf("%d", &choice) != 1) { clear_input_buffer(); continue; }
        clear_input_buffer();

        switch (choice) {
            case 0:
                printf("\n  感谢使用!\n");
                db_close(g_db);
                return EXIT_SUCCESS;
            case 1:  handle_add_feed();      break;
            case 2:  handle_list_feeds();    break;
            case 3:  handle_list_articles(); break;
            case 4:  handle_read_article();  break;
            case 5:  print_three_column_layout(); break;
            default: printf("  无效选项\n"); break;
        }
    }
    return EXIT_SUCCESS;
}
