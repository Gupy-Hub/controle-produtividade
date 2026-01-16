// Trecho atualizado do método salvarNoBanco em js/produtividade/importacao/validacao.js

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        const BATCH_SIZE = 500;
        const total = this.dadosProcessados.length;
        let enviados = 0;

        // Verifica se o usuário ainda está logado antes de começar
        const { data: { session } } = await Sistema.supabase.auth.getSession();
        if (!session) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = 'index.html';
            return;
        }

        try {
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const chunk = this.dadosProcessados.slice(i, i + BATCH_SIZE);
                
                // Realiza o upsert. 
                // IMPORTANTE: 'onConflict' deve ser exatamente o nome da constraint de unicidade no banco.
                const { error } = await Sistema.supabase
                    .from('producao')
                    .upsert(chunk, { 
                        onConflict: 'usuario_id,data_referencia',
                        ignoreDuplicates: false 
                    });

                if (error) {
                    // Trata erro 401 especificamente
                    if (error.code === '401' || error.status === 401) {
                        throw new Error("Erro 401: Sem permissão para gravar na tabela 'producao'. Verifique as políticas de RLS.");
                    }
                    throw error;
                }

                enviados += chunk.length;
                if(statusEl) {
                    const pct = Math.round((enviados/total)*100);
                    statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-sync fa-spin"></i> Gravando: ${pct}%</span>`;
                }
            }

            if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Importado!</span>`;
            alert("Importação concluída com sucesso!");
            
            if (Produtividade.Geral && Produtividade.Geral.carregarTela) {
                Produtividade.Geral.carregarTela();
            }

        } catch (e) {
            console.error("Erro detalhado no salvamento:", e);
            alert("Falha na importação: " + e.message);
            if(statusEl) statusEl.innerHTML = `<span class="text-red-600 font-bold">Erro 401: Falha na Autenticação</span>`;
        } finally {
            setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 5000);
        }
    }