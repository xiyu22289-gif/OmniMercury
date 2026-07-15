CC      := gcc
CFLAGS  := -Wall -Wextra -Wpedantic -Werror -std=c11 -O2 -g
CFLAGS  += -D_DEFAULT_SOURCE -D_GNU_SOURCE
CFLAGS  += -Iinclude
LDFLAGS := -lsqlite3 -lcurl -lcjson -lpthread -lm

SRCDIR  := src
OBJDIR  := build
TARGET  := rss-reader

SRCS    := $(wildcard $(SRCDIR)/*.c)
OBJS    := $(patsubst $(SRCDIR)/%.c, $(OBJDIR)/%.o, $(SRCS))

all: $(TARGET)

$(TARGET): $(OBJS)
	@echo "  LD      $@"
	@$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)
	@echo "  Build complete: $(TARGET)"

$(OBJDIR)/%.o: $(SRCDIR)/%.c | $(OBJDIR)
	@echo "  CC      $<"
	@$(CC) $(CFLAGS) -c -o $@ $<

$(OBJDIR):
	@mkdir -p $(OBJDIR)

clean:
	@echo "  CLEAN"
	@rm -rf $(OBJDIR) $(TARGET)

install-deps:
	@sudo apt-get install -y libsqlite3-dev libcurl4-openssl-dev libcjson-dev

run: $(TARGET)
	@./$(TARGET)

debug: CFLAGS += -DDEBUG -g -O0 -fsanitize=address
debug: LDFLAGS += -fsanitize=address
debug: clean $(TARGET)

.PHONY: all clean install-deps run debug
