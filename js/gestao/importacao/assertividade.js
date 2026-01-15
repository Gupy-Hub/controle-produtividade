window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo Log de Auditoria...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                // Remove caracteres especiais e normaliza
                return header.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro leitura: " + err.message);
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        const TAMANHO_LOTE = 1000; 

        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600"><i class="fas fa-filter"></i> Processando Qualidade...</span>`;
        await new Promise(r => setTimeout(r, 50));

        const dadosFormatados = linhas.map(linha => {
            // 1. DATA (Obrigatória no log detalhado)
            let valData = linha['end_time'] || linha['data_auditoria'] || linha['data']; 
            if (!valData) return null; 

            // Trata ISO Date
            if (valData.includes('T')) valData = valData.split('T')[0];

            // 2. ID DO USUÁRIO
            let idAssistente = linha['id_assistente'] || linha['id assistente'] || linha['id_ppc'];
            let usuarioIdFinal = null;
            if (idAssistente) {
                usuarioIdFinal = parseInt(idAssistente.toString().replace(/\D/g, ''));
            } else {
                return null; // Sem ID não importamos assertividade
            }

            // 3. TRATAMENTO DA NOTA (% Assert)
            // Se tiver valor, usa. Se for vazio, é NULL (não conta na média)
            let rawPorcentagem = linha['% assert'] || linha['assertividade'];
            let porcentagemFinal = null;

            if (rawPorcentagem && rawPorcentagem.trim() !== '') {
                porcentagemFinal = rawPorcentagem.trim();
            }

            // 4. Auditora
            const auditora = linha['auditora'] || 'Sistema';

            return {
                data_auditoria: valData,
                company_id: (linha['company_id'] || '0').toString(),
                empresa: (linha['empresa'] || 'Empresa não informada').trim(),
                usuario_id: usuarioIdFinal, 
                assistente: (linha['assistente'] || 'Desconhecido').trim(),
                doc_name: (linha['doc_name'] || linha['documento'] || '-').trim(),
                status: (linha['status'] || 'PROCESSADO').toUpperCase(), 
                obs: (linha['apontamentos/obs'] || linha['obs'] || ''),
                campos: parseInt(linha['nº campos']) || 0,
                ok: parseInt(linha['ok']) || 0,
                nok: parseInt(linha['nok']) || 0,
                porcentagem: porcentagemFinal, // NULL se vazio
                auditora: auditora
            };
        }).filter(item => item !== null);

        const total = dadosFormatados.length;
        if (total === 0) {
            alert("Nenhum registro de auditoria válido encontrado.");
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // LIMPEZA SEGURA (Remove dados antigos dessas datas para não duplicar)
        if(statusEl) statusEl.innerHTML = `<span class="text-amber-600"><i class="fas fa-eraser"></i> Atualizando período...</span>`;
        const datasParaLimpar = [...new Set(dadosFormatados.map(d => d.data_auditoria))];
        
        try {
            await Sistema.supabase.from('assertividade').delete().in('data_auditoria', datasParaLimpar);
        } catch (e) {
            console.error(e);
        }

        // INSERÇÃO
        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold">Salvando ${total} auditorias...</span>`;
        let sucesso = 0;

        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            if (!error) sucesso += lote.length;
            
            if (statusEl) {
                const pct = Math.round(((i + lote.length) / total) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-upload"></i> Progresso: ${pct}%</span>`;
            }
        }

        setTimeout(() => {
            if(statusEl) statusEl.innerHTML = "";
            alert(`Assertividade Atualizada!\n${sucesso} registros importados.`);
            if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
        }, 500);
    }
};