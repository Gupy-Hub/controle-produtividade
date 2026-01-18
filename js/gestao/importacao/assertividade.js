window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    // Aumentei o lote para agilizar as 220k linhas (Postgres aguenta bem)
    BATCH_SIZE: 1000, 

    higienizar: function(valor, tipo) {
        if (valor === undefined || valor === null) return null;
        
        // Remove caracteres fantasmas (BOM) e espaços
        let limpo = String(valor).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        if (limpo === "" || 
            limpo.toLowerCase() === "nan" || 
            limpo.toLowerCase() === "null" || 
            limpo.toLowerCase() === "undefined") {
            return null;
        }

        if (tipo === 'numero') {
            let num = parseFloat(limpo.replace('%', '').replace(',', '.'));
            return isNaN(num) ? null : num;
        }

        if (tipo === 'data') {
            try {
                // Tenta extrair Data ISO (2025-12-02T...) -> 2025-12-02
                if (limpo.includes('T')) return limpo.split('T')[0];
                
                // Formato BR (02/12/2025)
                if (limpo.includes('/')) {
                    const p = limpo.split('/');
                    if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
                }
                
                // Formato simples (2025-12-02)
                if (limpo.match(/^\d{4}-\d{2}-\d{2}$/)) return limpo;

            } catch (e) {
                return null;
            }
        }

        return limpo;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const btn = input.closest('div').querySelector('button');
            const originalText = btn.innerHTML; // Guarda o texto original do botão

            // Feedback inicial
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo Arquivo...';
            btn.disabled = true;

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "ISO-8859-1",
                // Corrige o bug do cabeçalho "end_time" invisível
                transformHeader: function(h) {
                    return h.trim().replace(/[\uFEFF\u200B]/g, '');
                },
                complete: async (results) => {
                    try {
                        // Passa o botão para a função poder atualizar a porcentagem
                        await this.tratarEEnviar(results.data, btn, originalText);
                    } catch (err) {
                        console.error(err);
                        alert("Erro no processamento: " + err.message);
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                }
            });
        }
    },

    tratarEEnviar: async function(linhas, btn, textoOriginal) {
        const payload = [];
        const totalLinhas = linhas.length;
        
        console.log(`🚀 Iniciando preparação de ${totalLinhas} registros...`);
        btn.innerHTML = `<i class="fas fa-cog fa-spin"></i> Preparando dados...`;

        // Loop sem verificação de duplicidade de ID (idsUnicos removido)
        for (const linha of linhas) {
            
            // Validações básicas para ignorar linhas vazias do Excel
            const idPpc = this.higienizar(linha['ID PPC']);
            const dataRef = this.higienizar(linha['end_time'], 'data');
            
            // Se não tem ID ou Data, pula (linha inválida)
            if (!idPpc || !dataRef) continue;

            // Limpeza do Timestamp para coluna TIMESTAMP do banco
            let endTimeRaw = this.higienizar(linha['end_time']);
            if (endTimeRaw && endTimeRaw.endsWith('Z')) endTimeRaw = endTimeRaw.slice(0, -1);

            const registro = {
                id_ppc: idPpc,
                data_referencia: dataRef,
                end_time: endTimeRaw,
                
                empresa_id: this.higienizar(linha['Company_id']),
                empresa: this.higienizar(linha['Empresa']),
                schema_id: this.higienizar(linha['Schema_id']),
                
                assistente: this.higienizar(linha['Assistente']),
                nome_assistente: this.higienizar(linha['Assistente']),
                
                auditora: this.higienizar(linha['Auditora']),
                nome_auditora_raw: this.higienizar(linha['Auditora']),
                
                doc_name: this.higienizar(linha['doc_name']),
                nome_documento: this.higienizar(linha['doc_name']),
                
                status: this.higienizar(linha['STATUS']),
                observacao: this.higienizar(linha['Apontamentos/obs']),
                obs: this.higienizar(linha['Apontamentos/obs']),
                
                num_campos: this.higienizar(linha['nº Campos'], 'numero'),
                campos: this.higienizar(linha['nº Campos'], 'numero'),
                
                qtd_ok: this.higienizar(linha['Ok'], 'numero'),
                ok: this.higienizar(linha['Ok'], 'numero'),
                
                qtd_nok: this.higienizar(linha['Nok'], 'numero'),
                nok: this.higienizar(linha['Nok'], 'numero'),
                
                porcentagem: this.higienizar(linha['% Assert']),
                
                data_auditoria: this.higienizar(linha['Data da Auditoria '], 'data'),
                qtd_validados: this.higienizar(linha['Quantidade_documentos_validados'], 'numero'),
                
                revalidacao: this.higienizar(linha['Revalidação']),
                fila: this.higienizar(linha['Fila'])
            };

            payload.push(registro);
        }

        if (payload.length === 0) {
            alert("Nenhum registro válido encontrado.");
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
            return;
        }

        // Envia para o banco com barra de progresso
        await this.enviarLotes(payload, btn, textoOriginal);
    },

    enviarLotes: async function(dados, btn, textoOriginal) {
        const total = dados.length;
        let processados = 0;
        let erros = 0;

        // IMPORTANTE: Use INSERT em vez de UPSERT para garantir que o histórico (220k linhas) seja salvo
        // Se usar Upsert com id_ppc, ele vai sobrescrever e sobrar só 18k de novo.
        const TABELA = 'assertividade';

        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            
            // INSERT puro para gravar histórico
            const { error } = await Sistema.supabase
                .from(TABELA)
                .insert(lote); 

            if (error) {
                console.error(`Erro lote ${i}:`, error.message);
                erros += lote.length;
            } else {
                processados += lote.length;
            }

            // Cálculo de Porcentagem
            const percent = Math.round(((i + lote.length) / total) * 100);
            btn.innerHTML = `<i class="fas fa-sync fa-spin"></i> Enviando... ${percent}%`;
        }

        // Restaura botão e avisa
        btn.innerHTML = textoOriginal;
        btn.disabled = false;

        let msg = `Importação Concluída!\n\nTotal Processado: ${total}\nSucessos: ${processados}\nFalhas: ${erros}`;
        
        if (erros > 0) {
            msg += "\n\nAlguns registros falharam (verifique duplicidade de chave primária 'id' se houver, ou erros de tipo).";
        }

        alert(msg);
        
        // Recarrega a tela de gestão
        if (window.Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
    }
};