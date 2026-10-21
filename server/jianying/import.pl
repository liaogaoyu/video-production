#!/usr/bin/perl
use strict; use warnings; use utf8;
use JSON::PP; use Encode qw(encode decode); use File::Basename qw(dirname); use Cwd qw(abs_path); use File::Copy qw(copy);
my $source=decode('UTF-8',abs_path(dirname(__FILE__)));
my $root=decode('UTF-8',$ARGV[0] // die "Missing draft root\n");
sub native { encode('UTF-8',$_[0]) }
sub read_json { my($p)=@_;open my $f,'<:raw',native($p) or die "Cannot read $p: $!\n";local $/;return decode_json(<$f>); }
my $manifest=read_json("$source/timeline.json");
$manifest->{kind} eq 'storydock-jianying' && $manifest->{id}=~/\A[0-9A-F-]{36}\z/ or die "Invalid package\n";
-d native($root) or die "Draft root does not exist. Select the folder shown in Jianying settings.\n";
my $folder=$manifest->{folderName} // "Storydock-$manifest->{id}";
$folder!~m{[/\\\x00]} && $folder!~/\A\./ or die "Unsafe draft folder\n";
my $dest="$root/$folder";
-e native($dest) and die "This package is already imported. Existing draft was not changed.\n";
for my $clip (@{$manifest->{clips}}){my $name=$clip->{file};$name!~m{[/\\\x00]} && $name!~/\A\./ or die "Unsafe media name\n";-f native("$source/draft/media/$name") or die "Missing media: $name\n";}
sub fix {
 my($v)=@_;
 if(ref($v) eq 'HASH'){ $v->{$_}=fix($v->{$_}) for keys %$v; }
 elsif(ref($v) eq 'ARRAY'){ $_=fix($_) for @$v; }
 elsif(!ref($v) && defined($v)){
  $v=~s/__STORYDOCK_DRAFT_PATH__/$dest/g; $v=~s/__STORYDOCK_DRAFT_ROOT__/$root/g;
 }return $v;
}
my @docs=map {[$_,fix(read_json("$source/draft/$_"))]} qw(draft_content.json draft_info.json draft_meta_info.json);
for my $doc (@docs){if($doc->[0] ne 'draft_meta_info.json'){$doc->[1]{platform}{os}='mac';}}
mkdir native($dest) or die "Cannot create draft: $!\n";
eval {
 mkdir native("$dest/media") or die "Cannot create media folder: $!\n";
 for my $clip (@{$manifest->{clips}}){copy(native("$source/draft/media/$clip->{file}"),native("$dest/media/$clip->{file}")) or die "Copy failed: $!\n";}
 for my $doc (@docs){open my $f,'>:raw',native("$dest/$doc->[0]") or die "Cannot write draft: $!\n";print $f encode_json($doc->[1]);close $f or die "Write failed: $!\n";}
};
if($@){my $error=$@;require File::Path;File::Path::remove_tree(native($dest));die $error;}
binmode STDOUT,':encoding(UTF-8)';print "Imported: $dest\n";
