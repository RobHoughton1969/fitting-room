#!/usr/bin/env perl
# Serves index.html on http://localhost:8731 (or $PORT).
# Only needed because browsers block IndexedDB on file:// — any static
# server works just as well.
use strict;
use warnings;
use IO::Socket::INET;

$| = 1;
$SIG{PIPE} = 'IGNORE';

my $port = $ENV{PORT} || 8731;
my $srv  = IO::Socket::INET->new(LocalPort => $port, Listen => 50, ReuseAddr => 1)
  or die "cannot bind port $port: $!\n";
print "Fitting Room on http://localhost:$port\n";

while (my $client = $srv->accept) {
  eval {
    my $request = <$client>;
    while (my $header = <$client>) { last if $header =~ /^\r?\n$/ }
    local $/;
    open my $fh, '<', 'index.html' or die "index.html missing — run ./build.sh\n";
    my $body = <$fh>;
    close $fh;
    print $client "HTTP/1.1 200 OK\r\n"
      . "Content-Type: text/html; charset=utf-8\r\n"
      . "Cache-Control: no-store\r\n"
      . "Content-Length: " . length($body) . "\r\n"
      . "Connection: close\r\n\r\n" . $body;
    1;
  };
  close $client;
}
